window.addEventListener("load", (event) => {
    console.log("Hello Gemini Realtime Demo!");

    setAvailableCamerasOptions();
    setAvailableMicrophoneOptions();
});

const PROXY_URL = "ws://localhost:8080";
const PROJECT_ID = "gen-lang-client-0390334955";
const MODEL = "gemini-live-2.5-flash-native-audio";
const API_HOST = "us-central1-aiplatform.googleapis.com";

const accessTokenInput = document.getElementById("token");
const projectInput = document.getElementById("project");
const systemInstructionsInput = document.getElementById("systemInstructions");

CookieJar.init("token");
CookieJar.init("project");
CookieJar.init("systemInstructions");

const disconnected = document.getElementById("disconnected");
const connecting = document.getElementById("connecting");
const connected = document.getElementById("connected");
const speaking = document.getElementById("speaking");

const micBtn = document.getElementById("micBtn");
const micOffBtn = document.getElementById("micOffBtn");
const cameraBtn = document.getElementById("cameraBtn");
const screenBtn = document.getElementById("screenBtn");

const cameraSelect = document.getElementById("cameraSource");
const micSelect = document.getElementById("audioSource");

const geminiLiveApi = new GeminiLiveAPI(PROXY_URL, PROJECT_ID, MODEL, API_HOST);

// Register demo tools
geminiLiveApi.addFunction(new PrintMessageTool());
geminiLiveApi.addFunction(new GetTimeTool());
geminiLiveApi.addFunction(new AddNumbersTool());
geminiLiveApi.addFunction(new GetWeatherTool());
geminiLiveApi.addFunction(new SearchWebTool());
geminiLiveApi.addFunction(new CalculatorTool());

console.log(
    "Registered tools:",
    geminiLiveApi.functions.map((f) => f.name),
);

geminiLiveApi.onErrorMessage = (message) => {
    showDialogWithMessage(message);
    setAppStatus("disconnected");
};

function getSelectedResponseModality() {
    // return "AUDIO";
    const radioButtons = document.querySelectorAll(
        'md-radio[name="responseModality"]',
    );

    let selectedValue;
    for (const radioButton of radioButtons) {
        if (radioButton.checked) {
            selectedValue = radioButton.value;
            break;
        }
    }
    return selectedValue;
}

function getSystemInstructions() {
    const userInstructions =
        systemInstructionsInput.value || "You are a helpful AI assistant.";

    // Automatically append tool usage instructions
    const toolInstructions = `

## IMPORTANT: Tool Call Behavior

When you call a tool, DO NOT read out or narrate the tool call itself. Simply call the tool silently and then speak naturally about the result once you receive it. The user will see the tool execution in a visual UI panel.

Example:
- BAD: "I'm going to call the get_current_time tool now. Calling get_current_time..."
- GOOD: [calls get_current_time silently] "It's currently 3:45 PM"

## Available Tools

You have access to the following tools that you can call to help users:

1. **print_message** - Prints a message to the browser console
   - Use when: User asks you to print, log, or display a message
   - Parameters: message (string) - The message to print
   - Example: "Print 'Hello World'" → call print_message with message="Hello World"

2. **get_current_time** - Returns the current time in the user's timezone
   - Use when: User asks for the current time, what time it is, or clock information
   - Parameters: none
   - Example: "What time is it?" → call get_current_time

3. **add_numbers** - Adds two numbers together
   - Use when: User asks you to add, sum, or calculate the total of two numbers
   - Parameters: a (number), b (number) - The two numbers to add
   - Example: "Add 5 and 7" → call add_numbers with a=5, b=7

4. **get_weather** - Gets the current weather for a location (simulated data)
   - Use when: User asks about weather, temperature, or conditions in a location
   - Parameters: location (string) - City name or location
   - Example: "What's the weather in Paris?" → call get_weather with location="Paris"

5. **search_web** - Searches the web for information (simulated results)
   - Use when: User asks you to search for something or find information online
   - Parameters: query (string) - Search query
   - Example: "Search for AI news" → call search_web with query="AI news"

6. **calculate** - Performs advanced calculations
   - Use when: User asks for mathematical operations beyond simple addition
   - Parameters: operation (string: add, subtract, multiply, divide, power, sqrt), a (number), b (number - optional for sqrt)
   - Example: "Multiply 15 by 8" → call calculate with operation="multiply", a=15, b=8

## When to Use Tools

- **Always use tools** when the user's request directly matches a tool's capability
- **Call tools SILENTLY** - do NOT narrate that you're calling a tool
- **Wait for results** - the tool will execute and return results to you
- **Speak naturally about results** - once you have the result, respond conversationally
- **Multiple tools** - you can call multiple tools, each silently
- **NO meta-commentary** - never say "I'm calling the X tool" or "Let me use Y"

## Tool Usage Examples

User: "What's the current time?"
Response: [calls get_current_time silently] It's currently 3:45 PM.

User: "What's the weather in London?"
Response: [calls get_weather silently] The weather in London is sunny with a temperature of 18 degrees Celsius.

User: "Search for machine learning tutorials"
Response: [calls search_web silently] I found over 500,000 results. The top resources include comprehensive guides on machine learning fundamentals...

User: "What's 25 times 8?"
Response: [calls calculate silently] That's 200.

User: "What time is it and what's the weather in Tokyo?"
Response: [calls both tools silently] It's 3:45 PM, and in Tokyo the weather is sunny with a temperature of 22 degrees Celsius.`;

    return userInstructions + toolInstructions;
}

function connectBtnClick() {
    setAppStatus("connecting");

    geminiLiveApi.responseModalities = getSelectedResponseModality();
    geminiLiveApi.systemInstructions = getSystemInstructions();

    geminiLiveApi.onConnectionStarted = () => {
        setAppStatus("connected");
        startAudioInput();
    };

    geminiLiveApi.setProjectId(projectInput.value);
    geminiLiveApi.connect(accessTokenInput.value);
}

const liveAudioOutputManager = new LiveAudioOutputManager();
let isAISpeaking = false;
let manualMicControl = false; // Track if user manually toggled mic

geminiLiveApi.onReceiveResponse = (messageResponse) => {
    if (messageResponse.type == "AUDIO") {
        // Calculate TTFB (Time To First Byte) - only for first audio chunk
        if (
            geminiLiveApi.firstAudioReceivedTime === null &&
            geminiLiveApi.lastAudioSentTime !== null
        ) {
            geminiLiveApi.firstAudioReceivedTime = messageResponse.receivedTime;
            const ttfb =
                geminiLiveApi.firstAudioReceivedTime -
                geminiLiveApi.lastAudioSentTime;
            console.log(
                `%c🚀 TTFB (Time To First Byte): ${ttfb.toFixed(2)}ms | Formula: (First Audio Received - Last Audio Sent)`,
                "background: #ff922b; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px; font-size: 13px;",
            );
        }

        // Auto-mute microphone while AI is speaking to prevent feedback loop
        if (!isAISpeaking && !manualMicControl) {
            console.log(
                "%c🔇 MIC AUTO-MUTED → AI is speaking",
                "background: #ff6b6b; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;",
            );
            isAISpeaking = true;
            liveAudioInputManager.disconnectMicrophone();
        }
        liveAudioOutputManager.playAudioChunk(messageResponse.data);

        // Re-enable microphone after AI finishes speaking
        clearTimeout(window.aiSpeakingTimeout);
        window.aiSpeakingTimeout = setTimeout(() => {
            if (!manualMicControl) {
                console.log(
                    "%c🎤 MIC AUTO-UNMUTED → AI finished",
                    "background: #51cf66; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;",
                );
                isAISpeaking = false;
                liveAudioInputManager.connectMicrophone();
                // Reset TTFB timer for next interaction
                geminiLiveApi.firstAudioReceivedTime = null;
            }
        }, 1500); // Wait 1.5 seconds after last audio chunk
    } else if (messageResponse.type == "TEXT") {
        console.log(
            "%c💬 AI TEXT RESPONSE",
            "background: #339af0; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;",
            messageResponse.data,
        );
        newModelMessage(messageResponse.data);
    } else if (messageResponse.type == "TOOL_CALL") {
        console.log(
            "\n%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
            "color: #ff6b6b; font-weight: bold;",
        );
        console.log(
            "%c🛠️  TOOL CALL RECEIVED",
            "background: #ff6b6b; color: white; font-weight: bold; font-size: 14px; padding: 6px 12px; border-radius: 4px;",
        );

        // Calculate tool call detection time (from last audio sent to tool call received)
        if (
            geminiLiveApi.lastAudioSentTime !== null &&
            messageResponse.receivedTime !== null
        ) {
            const toolCallDetectionTime =
                messageResponse.receivedTime - geminiLiveApi.lastAudioSentTime;
            console.log(
                `%c🎯 Tool Call Detection Time: ${toolCallDetectionTime.toFixed(2)}ms | Formula: (Tool Call Received - Last Audio Sent)`,
                "background: #ff922b; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px; font-size: 13px;",
            );
        }

        // Calculate round-trip time
        if (
            geminiLiveApi.lastMessageTime !== null &&
            messageResponse.receivedTime !== null
        ) {
            const roundTripTime =
                messageResponse.receivedTime - geminiLiveApi.lastMessageTime;
            console.log(
                `%c⚡ Round-trip time: ${roundTripTime.toFixed(2)}ms | Formula: (Response Received - Last Message Sent)`,
                "color: #ffd43b; font-weight: bold;",
            );
        }

        const functionCalls = messageResponse.data.functionCalls;
        console.log(
            `%c📊 Number of tools to execute: ${functionCalls.length}`,
            "color: #ff6b6b; font-weight: bold;",
        );

        for (let i = 0; i < functionCalls.length; i++) {
            const functionCall = functionCalls[i];
            const functionCallId = functionCall.id;
            const functionName = functionCall.name;
            const parameters = functionCall.args;

            console.log(
                `\n%c▶ EXECUTING TOOL #${i + 1}: ${functionName}`,
                "background: #7950f2; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;",
            );
            console.log(
                "%c📥 Parameters:",
                "color: #7950f2; font-weight: bold;",
                parameters,
            );

            // Measure tool execution time
            const toolStartTime = performance.now();
            const result = geminiLiveApi.callFunction(functionName, parameters);
            const toolEndTime = performance.now();
            const toolExecutionTime = toolEndTime - toolStartTime;

            // Send tool response back to the API
            geminiLiveApi.sendToolResponse(
                functionCallId,
                functionName,
                result,
            );

            console.log(
                "%c✅ SUCCESS!",
                "background: #51cf66; color: white; font-weight: bold; padding: 4px 8px; border-radius: 4px;",
            );
            console.log(
                "%c📤 Result:",
                "color: #51cf66; font-weight: bold;",
                result,
            );
            console.log(
                `%c⏱️  Execution time: ${toolExecutionTime.toFixed(2)}ms | Formula: (Tool End - Tool Start)`,
                "color: #ffd43b; font-weight: bold;",
            );
        }

        console.log(
            "%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n",
            "color: #51cf66; font-weight: bold;",
        );
    }
};

const liveAudioInputManager = new LiveAudioInputManager();

liveAudioInputManager.onNewAudioRecordingChunk = (audioData) => {
    geminiLiveApi.sendAudioMessage(audioData);
};

function addMessageToChat(message) {
    const textChat = document.getElementById("text-chat");
    const newParagraph = document.createElement("p");
    newParagraph.textContent = message;
    textChat.appendChild(newParagraph);
}

function newModelMessage(message) {
    addMessageToChat(">> " + message);
}

function newUserMessage() {
    const textMessage = document.getElementById("text-message");
    addMessageToChat("User: " + textMessage.value);
    geminiLiveApi.sendTextMessage(textMessage.value);

    textMessage.value = "";
}

function startAudioInput() {
    liveAudioInputManager.connectMicrophone();
}

function stopAudioInput() {
    liveAudioInputManager.disconnectMicrophone();
}

function micBtnClick() {
    console.log("micBtnClick - User manually muted");
    manualMicControl = true;
    stopAudioInput();
    micBtn.hidden = true;
    micOffBtn.hidden = false;
}

function micOffBtnClick() {
    console.log("micOffBtnClick - User manually unmuted");
    manualMicControl = false;
    startAudioInput();

    micBtn.hidden = false;
    micOffBtn.hidden = true;
}

const videoElement = document.getElementById("video");
const canvasElement = document.getElementById("canvas");

const liveVideoManager = new LiveVideoManager(videoElement, canvasElement);

const liveScreenManager = new LiveScreenManager(videoElement, canvasElement);

liveVideoManager.onNewFrame = (b64Image) => {
    geminiLiveApi.sendImageMessage(b64Image);
};

liveScreenManager.onNewFrame = (b64Image) => {
    geminiLiveApi.sendImageMessage(b64Image);
};

function startCameraCapture() {
    liveScreenManager.stopCapture();
    liveVideoManager.startWebcam();
}

function startScreenCapture() {
    liveVideoManager.stopWebcam();
    liveScreenManager.startCapture();
}

function cameraBtnClick() {
    startCameraCapture();
    console.log("cameraBtnClick");
}

function screenShareBtnClick() {
    startScreenCapture();
    console.log("screenShareBtnClick");
}

function newCameraSelected() {
    console.log("newCameraSelected ", cameraSelect.value);
    liveVideoManager.updateWebcamDevice(cameraSelect.value);
}

function newMicSelected() {
    console.log("newMicSelected", micSelect.value);
    liveAudioInputManager.updateMicrophoneDevice(micSelect.value);
}

function disconnectBtnClick() {
    setAppStatus("disconnected");
    geminiLiveApi.disconnect();
    stopAudioInput();
}

function showDialogWithMessage(messageText) {
    const dialog = document.getElementById("dialog");
    const dialogMessage = document.getElementById("dialogMessage");
    dialogMessage.innerHTML = messageText;
    dialog.show();
}

async function getAvailableDevices(deviceType) {
    const allDevices = await navigator.mediaDevices.enumerateDevices();
    const devices = [];
    allDevices.forEach((device) => {
        if (device.kind === deviceType) {
            devices.push({
                id: device.deviceId,
                name: device.label || device.deviceId,
            });
        }
    });
    return devices;
}

async function getAvailableCameras() {
    return await this.getAvailableDevices("videoinput");
}

async function getAvailableAudioInputs() {
    return await this.getAvailableDevices("audioinput");
}

function setMaterialSelect(allOptions, selectElement) {
    allOptions.forEach((optionData) => {
        const option = document.createElement("md-select-option");
        option.value = optionData.id;

        const slotDiv = document.createElement("div");
        slotDiv.slot = "headline";
        slotDiv.innerHTML = optionData.name;
        option.appendChild(slotDiv);

        selectElement.appendChild(option);
    });
}

async function setAvailableCamerasOptions() {
    const cameras = await getAvailableCameras();
    const videoSelect = document.getElementById("cameraSource");
    setMaterialSelect(cameras, videoSelect);
}

async function setAvailableMicrophoneOptions() {
    const mics = await getAvailableAudioInputs();
    const audioSelect = document.getElementById("audioSource");
    setMaterialSelect(mics, audioSelect);
}

function setAppStatus(status) {
    disconnected.hidden = true;
    connecting.hidden = true;
    connected.hidden = true;
    speaking.hidden = true;

    switch (status) {
        case "disconnected":
            disconnected.hidden = false;
            break;
        case "connecting":
            connecting.hidden = false;
            break;
        case "connected":
            connected.hidden = false;
            break;
        case "speaking":
            speaking.hidden = false;
            break;
        default:
    }
}
