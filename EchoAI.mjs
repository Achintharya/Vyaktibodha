import Mistral from "@mistralai/mistralai";
import { createClient } from "@supabase/supabase-js";
import * as readline from "readline";
import dotenv from 'dotenv';

// Load environment variables from a .env file
dotenv.config();

const mistralClient = new Mistral(process.env.MISTRAL_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_ATTEMPTS = 2;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function backoff(attempt) {
  const delay = BACKOFF_BASE_MS * (2 ** attempt);
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function processInput() {
  rl.question("-", async (input) => {
    if (input.toLowerCase() === 'exit') {
      rl.close();
      return;
    }

    if (!input.trim()) {
      console.log("Ask me anything you wanna know about me!");
      processInput();
      return;
    }

    try {
      const embedding = await createEmbedding([input]);
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
      processInput();
    }
  });
}

async function createEmbedding(inputArray) {
  try {
    const embeddingResponse = await mistralClient.embeddings({
      model: 'mistral-embed',
      input: inputArray // Ensure input is correctly passed as `input`
    });

    if (embeddingResponse?.data && embeddingResponse.data.length > 0 && embeddingResponse.data[0].embedding) {
      return embeddingResponse.data[0].embedding;
    } else {
      throw new Error("Unexpected response structure from the embeddings API.");
    }
  } catch (error) {
    console.error("Error creating embedding:", error.message);
    return null;
  }
}

async function retrieveMatches(embedding) {
  try {
    const { data, error } = await supabase.rpc('match_my_resume', {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: 3
    });

    if (error) throw error;

    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error("No matching content found.");
    }

    return data[0].content;
  } catch (error) {
    console.error("Error retrieving matches:", error.message);
    return null;
  }
}

async function generateChatResponse(context, query) {
  const currentDate = new Date().toLocaleDateString();
  const currentTime = new Date().toLocaleTimeString();
  const promptMessage = `Current Date and Time: ${currentDate}, ${currentTime}\nResume context: ${context} - Question: ${query}`;

  let attempt = 0;
  while (attempt < BACKOFF_MAX_ATTEMPTS) {
    try {
      const chatStreamResponse = await mistralClient.chatStream({
        model: 'mistral-tiny',
        messages: [
          { role: "system", content: "### YOU are Achintharya's AI assistant. ### <<<Reply in a paragraph. YOU MUST be straight-foward, truthful and professional. Ensure that you answer ONLY from the provided context and NEVER hallucinate any information>>>Remember that you are Achintharya and not an AI language model." },
          { role: 'user', content: promptMessage }
        ],
        temperature: 0.5, randomSeed: 615, maxTokens: 256
      });

      let finalResponse = '';
      for await (const chunk of chatStreamResponse) {
        const streamText = chunk.choices[0].delta.content;
        if (process.stdout.write(streamText)) {
        }
      }
      return finalResponse;
    } catch (error) {
      if (error.response && error.response.status === 429) {
        attempt++;
        if (attempt < BACKOFF_MAX_ATTEMPTS) {
          await backoff(attempt);
        }
      } else {
        console.error("Error generating chat response:", error.message);
        break; // Break the loop on other errors
      }
    }
  }

  console.error("I'm sorry, I'm too tired to talk. Please try again later.");
}

processInput();
