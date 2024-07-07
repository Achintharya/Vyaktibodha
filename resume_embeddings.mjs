import { promises as fs } from 'fs';
import MistralClient from "@mistralai/mistralai";
import { createClient } from "@supabase/supabase-js";

const client = new MistralClient("u2J9xMhy5qFjgpzMaCCT7YnoCIq1kjlH");
const supabase = createClient("https://bewwfdiqefwvthokopxy.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJld3dmZGlxZWZ3dnRob2tvcHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTkyMTk0NTcsImV4cCI6MjAzNDc5NTQ1N30.o5JY0pPTp1Kt_We67jL_WR_G8iwsm7hjRtF8HYKOcao");

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
        const embeddings = await client.embeddings({
            model: 'mistral-embed',
            input: sentences
        });
        const data = sentences.map((sentence, i) => {
            return {
                content: sentence,
                embedding: embeddings.data[i].embedding
            };
        });
        return data;
    } catch (error) {
        console.error("Error creating embeddings:", error);
        return []; // Return empty array on error
    }
}

const sentences = await splitDocument('AI_Achinth/resume_update.txt');
const embeddings = await createEmbeddings(sentences);

await supabase.from('my_resume').insert(embeddings);

console.log("Upload complete!");