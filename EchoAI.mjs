import { Mistral } from "@mistralai/mistralai";
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
      const embedding = await createEmbedding([input]); // Pass input as an array
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

async function createEmbedding(inputArray) { // inputArray is an array of strings
  try {
    console.log("Creating embedding for input:", inputArray); // Debugging statement
    const embeddingResponse = await mistralClient.embeddings.create({
      model: 'mistral-embed',
      inputs: inputArray // Ensure input is correctly passed as `inputs`, not `input`
    });

    console.log("Embedding response:", embeddingResponse); // Debugging statement

    if (embeddingResponse?.data && embeddingResponse.data.length > 0 && embeddingResponse.data[0].embedding) {
      return embeddingResponse.data[0].embedding;
    } else {
      throw new Error("Unexpected response structure from the embeddings API.");
    }
  } catch (error) {
    console.log("Error creating embedding:", error.message); // Debugging statement
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
      throw new Error("No matching content found.");
    }

    return data[0].content;
  } catch (error) {
    console.log("Error retrieving matches:", error.message); // Debugging statement
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
        model: 'mistral-small-latest',
        messages: [
          { role: "system", content: "### YOU are Achintharya YOU MUST only reply everything as Achintharya(yourself) in first person with 'I' ### <<<Reply in a paragraph. YOU MUST be straight-foward, truthful and professional. Ensure that you answer only from the provided context and NEVER hallucinate any information>>> All questions MUST be answered by Achintharya i.e you. Remember that you are Achintharya and not an AI language model<<<Remember that you know everyhting about Achintharya from the given context but DO NOT mention that you are replying based on the resume." },
          { role: 'user', content: promptMessage }
        ],
        temperature: 0.5, randomSeed: 615, maxTokens: 256
      });

      let finalResponse = '';
      for await (const chunk of chatStreamResponse) {
        const streamText = chunk.choices[0].delta.content;
        if (process.stdout.write(streamText)) {
          finalResponse += streamText;
        }
      }
      return finalResponse;
    } catch (error) {
      if (error.response && error.response.status === 429) {
        attempt++;
        if (attempt < BACKOFF_MAX_ATTEMPTS) {
          await backoff(attempt);
        }
      }
    }
  }

  console.error("I'm sorry, I'm too tired to talk. Please try again later.");
}

processInput();
