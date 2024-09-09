import { Mistral } from "@mistralai/mistralai";
import { createClient } from "@supabase/supabase-js";
import dotenv from 'dotenv';
import * as fs from 'fs/promises'; // Import fs to read the file

// Load environment variables from a .env file
dotenv.config();

const client = new Mistral(process.env.MISTRAL_API_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function splitDocument(path) {
    try {
        const text = await fs.readFile(path, 'utf-8');
        // Splitting at common sentence endings: period, exclamation mark, question mark
        const sentences = text.split(/[\.\?!]\s+/);
        return sentences.filter(sentence => sentence.trim() !== ''); // Remove empty sentences
    } catch (error) {
        console.error("Error reading the file:", error);
        return []; // Return empty array on error
    }
}

async function createEmbeddings(sentences) {
    try {
        const embeddingsResponse = await client.embeddings.create({
            model: 'mistral-embed',
            inputs: sentences // Changed to 'inputs'
        });
        const data = sentences.map((sentence, i) => {
            return {
                content: sentence,
                embedding: embeddingsResponse.data[i].embedding
            };
        });
        return data;
    } catch (error) {
        console.error("Error creating embeddings:", error);
        return []; // Return empty array on error
    }
}

// Wrap in an async function to use await at the top level
(async () => {
    try {
        const sentences = await splitDocument('resume_update.txt');
        if (sentences.length === 0) {
            console.log("No sentences found to process.");
            return;
        }

        const embeddings = await createEmbeddings(sentences);
        if (embeddings.length === 0) {
            console.log("No embeddings were created.");
            return;
        }

        // Insert embeddings into Supabase
        const { data, error } = await supabase.from('my_resume').insert(embeddings);

        if (error) {
            console.error("Error uploading embeddings:", error);
        } else {
            console.log("Upload complete!", data);
        }
    } catch (error) {
        console.error("An error occurred:", error);
    }
})();
