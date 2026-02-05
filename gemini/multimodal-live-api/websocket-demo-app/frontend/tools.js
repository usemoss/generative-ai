class FunctionCallDefinition {
    constructor(name, description, parameters, requiredParameters) {
        this.name = name;
        this.description = description;
        this.parameters = parameters;
        this.requiredParameters = requiredParameters;
    }

    getDefinition() {
        return {
            name: this.name,
            description: this.description,
            parameters: {
                required: this.requiredParameters,
                ...this.parameters
            },
        };
    }

    functionToCall(parameters) {
        // Override in subclasses
    }

    runFunction(parameters) {
        return this.functionToCall(parameters);
    }
}

// Dummy Tool 1: Print Message
class PrintMessageTool extends FunctionCallDefinition {
    constructor() {
        super(
            "print_message",
            "Prints a message to the console",
            {
                type: "object",
                properties: {
                    message: {
                        type: "string",
                        description: "The message to print"
                    }
                },
            },
            ["message"]
        );
    }

    functionToCall(parameters) {
        return `Printed: ${parameters.message}`;
    }
}

// Dummy Tool 2: Get Current Time
class GetTimeTool extends FunctionCallDefinition {
    constructor() {
        super(
            "get_current_time",
            "Returns the current time",
            {
                type: "object",
                properties: {},
            },
            []
        );
    }

    functionToCall(parameters) {
        const time = new Date().toLocaleTimeString();
        return time;
    }
}

// Dummy Tool 3: Add Numbers
class AddNumbersTool extends FunctionCallDefinition {
    constructor() {
        super(
            "add_numbers",
            "Adds two numbers together",
            {
                type: "object",
                properties: {
                    a: {
                        type: "number",
                        description: "First number"
                    },
                    b: {
                        type: "number",
                        description: "Second number"
                    }
                },
            },
            ["a", "b"]
        );
    }

    functionToCall(parameters) {
        const result = parameters.a + parameters.b;
        return result;
    }
}

// Enhanced Tool 4: Get Weather (Simulated)
class GetWeatherTool extends FunctionCallDefinition {
    constructor() {
        super(
            "get_weather",
            "Gets the current weather for a specified location (simulated data)",
            {
                type: "object",
                properties: {
                    location: {
                        type: "string",
                        description: "City name or location"
                    }
                },
            },
            ["location"]
        );
    }

    functionToCall(parameters) {
        const location = parameters.location;

        // Simulate weather data
        const temperatures = [18, 22, 25, 28, 32, 15, 20];
        const conditions = ["Sunny", "Cloudy", "Rainy", "Partly Cloudy", "Clear"];
        const temp = temperatures[Math.floor(Math.random() * temperatures.length)];
        const condition = conditions[Math.floor(Math.random() * conditions.length)];

        const weather = {
            location: location,
            temperature: `${temp}°C`,
            condition: condition,
            humidity: `${Math.floor(Math.random() * 40) + 40}%`,
            wind: `${Math.floor(Math.random() * 20) + 5} km/h`
        };

        return weather;
    }
}

// Enhanced Tool 5: Search Web (Simulated)
class SearchWebTool extends FunctionCallDefinition {
    constructor() {
        super(
            "search_web",
            "Searches the web for information (simulated results)",
            {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Search query"
                    }
                },
            },
            ["query"]
        );
    }

    functionToCall(parameters) {
        const query = parameters.query;

        // Simulate search results
        const results = {
            query: query,
            results_found: Math.floor(Math.random() * 1000000) + 100000,
            top_results: [
                {
                    title: `Understanding ${query} - Complete Guide`,
                    snippet: `Learn everything about ${query} with this comprehensive guide...`,
                    url: `https://example.com/${query.replace(/\s+/g, '-').toLowerCase()}`
                },
                {
                    title: `${query} - Best Practices and Tips`,
                    snippet: `Discover the best practices for ${query}...`,
                    url: `https://example.com/tips-${query.replace(/\s+/g, '-').toLowerCase()}`
                }
            ]
        };

        return results;
    }
}

// Enhanced Tool 6: Calculate (Advanced)
class CalculatorTool extends FunctionCallDefinition {
    constructor() {
        super(
            "calculate",
            "Performs advanced calculations including multiply, divide, power, square root",
            {
                type: "object",
                properties: {
                    operation: {
                        type: "string",
                        description: "Operation type: add, subtract, multiply, divide, power, sqrt"
                    },
                    a: {
                        type: "number",
                        description: "First number"
                    },
                    b: {
                        type: "number",
                        description: "Second number (not required for sqrt)"
                    }
                },
            },
            ["operation", "a"]
        );
    }

    functionToCall(parameters) {
        const { operation, a, b } = parameters;
        let result;

        switch(operation.toLowerCase()) {
            case 'add':
                result = a + b;
                break;
            case 'subtract':
                result = a - b;
                break;
            case 'multiply':
                result = a * b;
                break;
            case 'divide':
                result = b !== 0 ? a / b : "Error: Division by zero";
                break;
            case 'power':
                result = Math.pow(a, b);
                break;
            case 'sqrt':
                result = Math.sqrt(a);
                break;
            default:
                result = "Error: Unknown operation";
        }

        return result;
    }
}

console.log("loaded tools.js");
