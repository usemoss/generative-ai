import asyncio
import json
import time

import websockets
from websockets.legacy.protocol import WebSocketCommonProtocol
from websockets.legacy.server import WebSocketServerProtocol

HOST = "us-central1-aiplatform.googleapis.com"
SERVICE_URL = f"wss://{HOST}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent"

DEBUG = False


class LatencyTracker:
    """Tracks latency metrics for text and audio responses."""

    def __init__(self):
        self.request_start_time = None
        self.first_text_token_received = False
        self.first_audio_byte_received = False

    def mark_request_start(self):
        """Mark the start of a new request."""
        self.request_start_time = time.time()
        self.first_text_token_received = False
        self.first_audio_byte_received = False

    def check_and_log_first_response(self, message_data: dict):
        """Check if this is the first text token or audio byte and log timing."""
        if self.request_start_time is None:
            return

        # Check for tool call response
        if message_data.get("toolCall"):
            elapsed = (time.time() - self.request_start_time) * 1000  # Convert to ms
            tool_calls = message_data.get("toolCall", {}).get("functionCalls", [])
            if tool_calls:
                tool_names = [tc.get("name") for tc in tool_calls]
                print(f"🔧 Time to Tool Call ({', '.join(tool_names)}): {elapsed:.2f}ms")

        # Check for text response
        parts = message_data.get("serverContent", {}).get("modelTurn", {}).get("parts", [])
        if parts and not self.first_text_token_received:
            if parts[0].get("text"):
                elapsed = (time.time() - self.request_start_time) * 1000  # Convert to ms
                print(f"⏱️  Time to First Text Token: {elapsed:.2f}ms")
                self.first_text_token_received = True
            elif parts[0].get("inlineData", {}).get("data"):
                if not self.first_audio_byte_received:
                    elapsed = (time.time() - self.request_start_time) * 1000  # Convert to ms
                    print(f"🎵 Time to First Audio Byte: {elapsed:.2f}ms")
                    self.first_audio_byte_received = True


async def proxy_task(
    client_websocket: WebSocketCommonProtocol,
    server_websocket: WebSocketCommonProtocol,
    latency_tracker: LatencyTracker = None,
    is_client_to_server: bool = False,
) -> None:
    """
    Forwards messages from one WebSocket connection to another.

    Args:
        client_websocket: The WebSocket connection from which to receive messages.
        server_websocket: The WebSocket connection to which to send messages.
        latency_tracker: Optional tracker for measuring latency metrics.
        is_client_to_server: True if forwarding from client to server, False otherwise.
    """
    async for message in client_websocket:
        try:
            data = json.loads(message)
            if DEBUG:
                print("proxying: ", data)

            # Track request start when client sends a message with content
            if is_client_to_server and latency_tracker:
                if "client_content" in data or "realtime_input" in data:
                    latency_tracker.mark_request_start()

            # Check for first response when server sends back
            if not is_client_to_server and latency_tracker:
                latency_tracker.check_and_log_first_response(data)

            await server_websocket.send(json.dumps(data))
        except Exception as e:
            print(f"Error processing message: {e}")

    await server_websocket.close()


async def create_proxy(
    client_websocket: WebSocketCommonProtocol, bearer_token: str
) -> None:
    """
    Establishes a WebSocket connection to the server and creates two tasks for
    bidirectional message forwarding between the client and the server.

    Args:
        client_websocket: The WebSocket connection of the client.
        bearer_token: The bearer token for authentication with the server.
    """

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {bearer_token}",
    }

    # Create latency tracker for this connection
    latency_tracker = LatencyTracker()

    async with websockets.connect(
        SERVICE_URL, additional_headers=headers
    ) as server_websocket:
        client_to_server_task = asyncio.create_task(
            proxy_task(
                client_websocket,
                server_websocket,
                latency_tracker=latency_tracker,
                is_client_to_server=True,
            )
        )
        server_to_client_task = asyncio.create_task(
            proxy_task(
                server_websocket,
                client_websocket,
                latency_tracker=latency_tracker,
                is_client_to_server=False,
            )
        )
        await asyncio.gather(client_to_server_task, server_to_client_task)


async def handle_client(client_websocket: WebSocketServerProtocol) -> None:
    """
    Handles a new client connection, expecting the first message to contain a bearer token.
    Establishes a proxy connection to the server upon successful authentication.

    Args:
        client_websocket: The WebSocket connection of the client.
    """
    print("New connection...")
    try:
        # Wait for the first message from the client
        auth_message = await asyncio.wait_for(client_websocket.recv(), timeout=10.0)
        auth_data = json.loads(auth_message)

        if "bearer_token" in auth_data:
            bearer_token = auth_data["bearer_token"]
            print("Bearer token received, establishing proxy connection...")
        else:
            print("Error: Bearer token not found in the first message.")
            await client_websocket.close(code=1008, reason="Bearer token missing")
            return

        await create_proxy(client_websocket, bearer_token)
    except asyncio.TimeoutError:
        print("Error: Timeout waiting for bearer token from client")
        await client_websocket.close(code=1008, reason="Timeout waiting for auth")
    except Exception as e:
        print(f"Error handling client connection: {e}")
        await client_websocket.close(code=1011, reason="Internal error")


async def main() -> None:
    """
    Starts the WebSocket server and listens for incoming client connections.
    """
    async with websockets.serve(handle_client, "localhost", 8080):
        print("Running websocket server localhost:8080...")
        # Run forever
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
