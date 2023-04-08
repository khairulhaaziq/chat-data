import { HNSWLib } from "langchain/vectorstores";
import { OpenAIEmbeddings } from "langchain/embeddings";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { Configuration, OpenAIApi } from "openai";
import "dotenv/config";
import fs from "fs";
import readline from "readline";
import { getTranscript } from "./get_transcript";
// import { CSVLoader } from "../retrievalqa/csvloader";
//import { CSVLoader } from "langchain/document_loaders";

const url = "https://en.wikipedia.org/wiki/Anwar_Ibrahim";
const videoUrl = "https://www.youtube.com/watch?v=-chxOl0zQwQ";
// Save the vector store to a directory
const directory = `stores/${url}`;
let vectorStore;

export const run = async () => {
	if (videoUrl) {
		const videoId = videoUrl.split("?")[1].split("=")[1];
		const directory = `stores/youtube/${videoId}`
		try {
			await fs.promises.access(directory);
			// Load the vector store from the directory if it exists
			vectorStore = await HNSWLib.load(
				directory,
				new OpenAIEmbeddings()
			);
		} catch (error) {
			// Fetch and parse HTML content from the Wikipedia link

			const transcript = await getTranscript(videoUrl);
			if (transcript === "error") {
				return;
			}
			const splitter = new RecursiveCharacterTextSplitter({
				chunkSize: 256,
				chunkOverlap: 10,
			});

			const output = await splitter.createDocuments([
				transcript as string,
			]);

			//const loader = new CSVLoader("all_hadiths_clean.csv", "text_en", ["text_ar", "source", "hadith_id", "chapter_no", "hadith_no", "chapter"]);
			//const output = await loader.load();

			// Load the docs into the vector store
			// Create a vector store through any method, here from texts as an example
			vectorStore = await HNSWLib.fromDocuments(
				output,
				new OpenAIEmbeddings()
			);

			// Save the vector store to the directory
			await vectorStore.save(directory);
		}
	} else {
		try {
			await fs.promises.access(directory);
			// Load the vector store from the directory if it exists
			vectorStore = await HNSWLib.load(
				directory,
				new OpenAIEmbeddings()
			);
		} catch (error) {
			// Fetch and parse HTML content from the Wikipedia link

			const response = await fetch(url);
			const html = await response.text();

			// Parse the HTML content with Readability
			const dom = new JSDOM(html, { url });
			const docs = new Readability(
				dom.window.document
			).parse();

			const splitter = new RecursiveCharacterTextSplitter({
				chunkSize: 1000,
				chunkOverlap: 100,
			});

			const output = await splitter.createDocuments([
				docs?.textContent as string,
			]);

			console.log(output);

			//const loader = new CSVLoader("all_hadiths_clean.csv", "text_en", ["text_ar", "source", "hadith_id", "chapter_no", "hadith_no", "chapter"]);
			//const output = await loader.load();

			// Load the docs into the vector store
			// Create a vector store through any method, here from texts as an example
			vectorStore = await HNSWLib.fromDocuments(
				output,
				new OpenAIEmbeddings()
			);

			// Save the vector store to the directory
			await vectorStore.save(directory);
		}
	}
	askQuestion();
};

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

const askQuestion = async () => {
	rl.question(
		"Enter your question (type 'exit' to quit): ",
		async (question) => {
			if (question.toLowerCase() === "exit") {
				console.log("Exiting...");
				rl.close();
			} else {
				// Search for the most similar document
				const resultOne =
					await vectorStore.similaritySearch(
						question,
						7
					);

				let formattedSources =
					"Provide a 2-3 sentence answer to the query based on the following sources. Be original, concise, accurate, and helpful. Cite sources as [1] or [2] or [3] after each sentence (not just the very end) to back up your answer, the question is at the end, answer using the language and style of the question at the end. (Ex: Correct: [1], Correct: [2][3], Incorrect: [1, 2]).\n\n";

				let i = 1;
				await resultOne.forEach((el) => {
					formattedSources = `${formattedSources}Sources [${i}]:\n${el.pageContent}\n\n`;
					i++;
				});

				console.log(formattedSources);

				const configuration = new Configuration({
					apiKey: process.env.OPENAI_API_KEY,
				});
				const openai = new OpenAIApi(configuration);

				const response =
					await openai.createChatCompletion({
						model: "gpt-3.5-turbo",
						messages: [
							{
								role: "user",
								content:
									formattedSources +
									question,
							},
						],
					});

				console.log(
					response.data.choices[0].message
						?.content
				);

				askQuestion();
			}
		}
	);
};

// Call the run function
run().catch(console.error);
