import MistralClient from "@mistralai/mistralai";
import { createClient } from "@supabase/supabase-js";
import * as readline from "readline";


const mistralClient = new MistralClient("u2J9xMhy5qFjgpzMaCCT7YnoCIq1kjlH");
const supabase = createClient("https://bewwfdiqefwvthokopxy.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJld3dmZGlxZWZ3dnRob2tvcHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTkyMTk0NTcsImV4cCI6MjAzNDc5NTQ1N30.o5JY0pPTp1Kt_We67jL_WR_G8iwsm7hjRtF8HYKOcao");

const BACKOFF_BASE_MS = 500; // Base backoff time in milliseconds
const BACKOFF_MAX_ATTEMPTS = 2; // Maximum number of retry attempts

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function backoff(attempt) {
  const delay = BACKOFF_BASE_MS * (2 ** attempt);
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function processInput() {
  rl.question("-",async (input) => {
    if (input.toLowerCase() === 'exit') {
      rl.close();
      return;
    }

    if (!input.trim()) {
      console.log("Ask me anything you wanna know about me!");
      processInput(); // Ask again for input
      return;
    }

    try {
      const embedding = await createEmbedding(input);
      if (!embedding) {
        throw new Error("Failed to create embedding for input.");
      }

      const context = await retrieveMatches(embedding);
      if (!context) {
        throw new Error("Failed to retrieve matching content.");
      }

      const response = await generateChatResponse(context, input);
      console.log(response);
    } catch (error) {
      console.error("Sorry, an error occurred:", error.message);
    } finally {
      processInput(); // Continue asking for input recursively
    }
  });
}

async function createEmbedding(input) {
  try {
    const embeddingResponse = await mistralClient.embeddings({
      model: 'mistral-embed',
      input: [input]
    });
    // Check if embeddingResponse has the expected data structure
    if (embeddingResponse?.data && embeddingResponse.data.length > 0 && embeddingResponse.data[0].embedding) {
      return embeddingResponse.data[0].embedding;
    } else {
      throw new Error("I'm sorry, Unexpected response structure from the embeddings API :( Please try again later 🕺");
    }
  } catch (error) {
    console.log("I'm sorry, I", error.message, ":( Please try again later 🕺");
    // Handle the error as needed, e.g., return null, throw the error, or show a user-friendly message
    return null;
  }
  
}

async function retrieveMatches(embedding) {
    try {
        const { data } = await supabase.rpc('match_my_resume', {
            query_embedding: embedding,
            match_threshold: 0.7,
            match_count: 3
        });
        if (!data || !Array.isArray(data) || data.length === 0) {
            console.log("I'm sorry, I'm only here to answer any professional questions. 🕺");
        }
        return data[0].content; //  data is an array and accessing the first element's content

    } catch (error) {
        console.log( error.message);       
    }
}

async function generateChatResponse(context, query) {
  // Get current date and time
  const currentDate = new Date().toLocaleDateString();
  const currentTime = new Date().toLocaleTimeString();

  // Prompt message including current date and time
  const promptMessage = `Current Date and Time: ${currentDate}, ${currentTime}\n`
                       +  `Resume context: ${context} - Question: ${query}`;

  let attempt = 0;
  while (attempt < BACKOFF_MAX_ATTEMPTS) {
    try {
      // Call Mistral AI chat API with streaming
      const chatStreamResponse = await mistralClient.chatStream({
        model: 'mistral-small-latest',
        messages: [
          { role: "system", content: "### YOU are Achintharya YOU MUST only reply everything as Achintharya(yourself) in first person with 'I' ### <<<Reply in a paragraph. YOU MUST be straight-foward, truthful and professional. Ensure that you answer only from the provided context and NEVER hallucinate any information>>> All questions MUST be answered by Achintharya i.e you. Remember that you are Achintharya and not an AI language model<<<Remember that you know everyhting about Achintharya from the given context but DO NOT mention that you are replying based on the resume."},
          { role: 'user', content: promptMessage }
        ],
        temperature: 0.5, randomSeed: 615, maxTokens: 256
      });

      console.log();
      let finalResponse = '';
      for await (const chunk of chatStreamResponse) {
        const streamText = chunk.choices[0].delta.content;
          if (process.stdout.write(streamText)){
          finalResponse += streamText;}        
      }
      return ''// Return the accumulated response

    } catch (error) {
      if (error.response && error.response.status === 429) {
        attempt++;
        if (attempt < BACKOFF_MAX_ATTEMPTS) {
          await backoff(attempt);
        }
      }
    }
  }
  // If the loop reaches this point, it means that all retry attempts have failed
  console.error("I'm sorry, I'm too tired to talk. Please try again later.");
}

processInput();