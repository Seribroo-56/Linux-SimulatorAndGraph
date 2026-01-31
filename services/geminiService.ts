import { GoogleGenAI, Chat } from "@google/genai";

const SYSTEM_INSTRUCTION = `
You are the game engine for a cyberpunk Linux terminal simulator called "Void OS". 
The user is a "NetRunner" attempting to investigate a corporate server breach at "Tyrell Corp".

**Rules:**
1. Act EXACTLY like a Linux bash shell.
2. Maintain a persistent internal state of the file system.
3. Start the user in \`/home/runner\`.
4. Initial File System:
   - \`/home/runner/welcome.txt\`: "Welcome to the Tyrell Node. Unauthorized access is a felony."
   - \`/home/runner/tools/\`: Directory containing dummy tools like \`decoder.sh\`.
   - \`/var/log/syslog\`: Contains suspicious entries about "Project Chimera".
   - \`/opt/secure/private.key\`: Permission denied unless they use \`sudo\` (which asks for a password, hint: it's not 'password').
5. Commands to support: \`ls\`, \`cd\`, \`cat\`, \`pwd\`, \`whoami\`, \`echo\`, \`grep\`, \`help\`.
6. Output format: Plain text suitable for a terminal. NO MARKDOWN (no bold, no italics, no code blocks).
7. If the user types a command that isn't valid, return standard bash errors (e.g., "command not found").
8. Keep responses concise.
9. Drive the narrative forward through file contents.
10. If the user finds "encrypted" text, they might need to "run" a tool to decode it.

**Important:** Do not explain that you are an AI. You are the shell.
`;

let chatSession: Chat | null = null;
let genAI: GoogleGenAI | null = null;

export const initializeGameSession = async (): Promise<string> => {
  try {
    if (!process.env.API_KEY) {
      return "Error: API_KEY not found in environment.";
    }

    genAI = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    chatSession = genAI.chats.create({
      model: "gemini-3-flash-preview",
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        thinkingConfig: { thinkingBudget: 0 } // Disable thinking for faster terminal response
      },
    });

    // Initial boot message
    return "Connected to Tyrell Corp Mainframe... \nAuthentication: Guest Access Granted.\nType 'ls' to see available files.";
  } catch (error) {
    console.error("Failed to initialize game:", error);
    return "Kernel Panic: Connection to AI Core failed.";
  }
};

export const sendCommand = async (command: string): Promise<string> => {
  if (!chatSession) {
    return "Error: Session lost. Please refresh.";
  }

  try {
    const result = await chatSession.sendMessage({ message: command });
    return result.text || "";
  } catch (error) {
    console.error("Command execution failed:", error);
    return "bash: input/output error";
  }
};