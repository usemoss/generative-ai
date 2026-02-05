class GeminiLiveResponseMessage {
    constructor(data, receivedTime = null) {
        this.data = "";
        this.type = "";
        this.endOfTurn = data?.serverContent?.turnComplete;
        this.receivedTime = receivedTime;

        const parts = data?.serverContent?.modelTurn?.parts;

        if (data?.setupComplete) {
            this.type = "SETUP COMPLETE";
        } else if (data?.toolCall) {
            this.type = "TOOL_CALL";
            this.data = data?.toolCall;
        } else if (parts?.length && parts[0].text) {
            this.data = parts[0].text;
            this.type = "TEXT";
        } else if (parts?.length && parts[0].inlineData) {
            this.data = parts[0].inlineData.data;
            this.type = "AUDIO";
        }
    }
}

class GeminiLiveAPI {
    constructor(proxyUrl, projectId, model, apiHost) {
        this.proxyUrl = proxyUrl;

        this.projectId = projectId;
        this.model = model;
        this.modelUri = `projects/${this.projectId}/locations/us-central1/publishers/google/models/${this.model}`;

        this.responseModalities = ["AUDIO"];
        this.systemInstructions = "";

        this.apiHost = apiHost;
        this.serviceUrl = `wss://${this.apiHost}/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;

        this.onReceiveResponse = (message) => {
            console.log("Default message received callback", message);
        };

        this.onConnectionStarted = () => {
            console.log("Default onConnectionStarted");
        };

        this.onErrorMessage = (message) => {
            alert(message);
        };

        this.accessToken = "";
        this.websocket = null;

        this.functions = [];
        this.functionsMap = {};

        this.lastMessageTime = null;
        this.lastAudioSentTime = null;
        this.firstAudioReceivedTime = null;

        console.log("Created Gemini Live API object: ", this);
    }

    setProjectId(projectId) {
        this.projectId = projectId;
        this.modelUri = `projects/${this.projectId}/locations/us-central1/publishers/google/models/${this.model}`;
    }

    setAccessToken(newAccessToken) {
        console.log("setting access token: ", newAccessToken);
        this.accessToken = newAccessToken;
    }

    connect(accessToken) {
        this.setAccessToken(accessToken);
        this.setupWebSocketToService();
    }

    disconnect() {
        this.webSocket.close();
    }

    sendMessage(message) {
        this.webSocket.send(JSON.stringify(message));
    }

    onReceiveMessage(messageEvent) {
        const receivedTime = performance.now();
        const messageData = JSON.parse(messageEvent.data);
        const message = new GeminiLiveResponseMessage(messageData, receivedTime);
        this.onReceiveResponse(message);
    }

    setupWebSocketToService() {
        console.log("%c🔌 CONNECTING TO WEBSOCKET", "background: #339af0; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;", this.proxyUrl);

        this.webSocket = new WebSocket(this.proxyUrl);

        this.webSocket.onclose = (event) => {
            console.log("%c🔌 WEBSOCKET CLOSED", "background: #868e96; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;");
            this.onErrorMessage("Connection closed");
        };

        this.webSocket.onerror = (event) => {
            console.log("%c❌ WEBSOCKET ERROR", "background: #fa5252; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;");
            this.onErrorMessage("Connection error");
        };

        this.webSocket.onopen = (event) => {
            console.log("%c✅ WEBSOCKET CONNECTED", "background: #51cf66; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;");
            this.sendInitialSetupMessages();
            this.onConnectionStarted();
        };

        this.webSocket.onmessage = this.onReceiveMessage.bind(this);
    }

    sendInitialSetupMessages() {
        const serviceSetupMessage = {
            bearer_token: this.accessToken,
            service_url: this.serviceUrl,
        };
        this.sendMessage(serviceSetupMessage);

        const tools = this.getFunctionDefinitions();

        const sessionSetupMessage = {
            setup: {
                model: this.modelUri,
                generation_config: {
                    response_modalities: this.responseModalities,
                },
                system_instruction: {
                    parts: [{ text: this.systemInstructions }],
                },
            },
        };

        // Add tools if any are registered
        if (tools.length > 0) {
            sessionSetupMessage.setup.tools = [{
                functionDeclarations: tools
            }];
            console.log("Registering tools:", tools);
        }

        this.sendMessage(sessionSetupMessage);
    }

    sendTextMessage(text) {
        const textMessage = {
            client_content: {
                turns: [
                    {
                        role: "user",
                        parts: [{ text: text }],
                    },
                ],
                turn_complete: true,
            },
        };
        this.lastMessageTime = performance.now();
        this.sendMessage(textMessage);
    }

    sendRealtimeInputMessage(data, mime_type) {
        const message = {
            realtime_input: {
                media_chunks: [
                    {
                        mime_type: mime_type,
                        data: data,
                    },
                ],
            },
        };
        this.sendMessage(message);
    }

    sendAudioMessage(base64PCM) {
        this.lastAudioSentTime = performance.now();
        this.sendRealtimeInputMessage(base64PCM, "audio/pcm");
    }

    sendImageMessage(base64Image, mime_type = "image/jpeg") {
        this.sendRealtimeInputMessage(base64Image, mime_type);
    }

    addFunction(functionDefinition) {
        this.functions.push(functionDefinition);
        this.functionsMap[functionDefinition.name] = functionDefinition;
    }

    getFunctionDefinitions() {
        return this.functions.map((func) => func.getDefinition());
    }

    callFunction(functionName, parameters) {
        const functionToCall = this.functionsMap[functionName];
        if (functionToCall) {
            const result = functionToCall.runFunction(parameters);
            return result;
        } else {
            console.error(`Function ${functionName} not found`);
            return null;
        }
    }

    sendToolResponse(functionCallId, functionName, result) {
        const toolResponseMessage = {
            tool_response: {
                function_responses: [
                    {
                        id: functionCallId,
                        name: functionName,
                        response: typeof result === 'object' ? result : { result: result }
                    }
                ]
            }
        };
        this.sendMessage(toolResponseMessage);
    }
}

console.log("loaded gemini-live-api.js");
