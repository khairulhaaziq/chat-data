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
import { CSVLoader } from "./csvloader";
//import { CSVLoader } from "langchain/document_loaders";

const url =
	"https://pocketbase.io/docs/going-to-production/#deployment-strategies";
const videoUrl = "";
const hadith = true;
// Save the vector store to a directory
let directory = `stores/${url}`;
let vectorStore;

export const run = async () => {
	if (hadith) {
		directory = "stores/all_hadiths_clean";
		try {
			await fs.promises.access(directory);
			console.log("found store");
			// Load the vector store from the directory if it exists
			console.log("loading store...");
			vectorStore = await HNSWLib.load(
				directory,
				new OpenAIEmbeddings()
			);
		} catch (error) {
			const loader = new CSVLoader(
				"src/all_hadiths_clean.csv",
				"text_en",
				[
					"id",
					"text_ar",
					"source",
					"hadith_id",
					"hadith_no",
					"chapter",
					"chapter_no",
					"chain_indx",
				]
			);
			const output = await loader.loadAndSplit();
			console.log(output);

			console.log("creating vector store...");
			vectorStore = await HNSWLib.fromDocuments(
				output,
				new OpenAIEmbeddings()
			);
			console.log("saving vector store...");
			// Save the vector store to the directory
			await vectorStore.save(directory);
			console.log("vector store saved.");
		}
	} else if (videoUrl) {
		const videoId = videoUrl.split("?")[1].split("=")[1];
		directory = `stores/youtube/${videoId}`;
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
				chunkSize: 512,
				chunkOverlap: 20,
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
					"Provide a 2-3 sentence answer to the query with context solely based on the following sources. Be original, concise, accurate, and helpful. Cite sources as [1] or [2] or [3] after each sentence (not just the very end) to back up your answer. (Ex: Correct: [1], Correct: [2][3], Incorrect: [1, 2]).\n\n";

				let i = 1;
				await resultOne.forEach((el) => {
					formattedSources = `${formattedSources}Sources [${i}]:\n${el.pageContent}\n\n`;
					i++;
				});

				const configuration = new Configuration({
					apiKey: process.env.OPENAI_API_KEY,
				});
				const openai = new OpenAIApi(configuration);

				const response =
					await openai.createChatCompletion({
						model: "gpt-3.5-turbo",
						messages: [
							{
								role: "system",
								content: formattedSources,
							},
							{
								role: "user",
								content: question,
							},
						],
					});

				const content =
					response.data.choices[0].message
						?.content;
				console.log(content);

				// Extract the source numbers cited in the response
				const citedSources = new Set(
					Array.from(
						content.matchAll(/\[(\d+)\]/g),
						(m) => parseInt(m[1])
					)
				);

				// Print the cited sources after the main output
				console.log("\nSources:");
				for (const sourceNumber of citedSources) {
					let modifiedMetadata = {
						index: sourceNumber,
						text_en: resultOne[
							sourceNumber - 1
						].pageContent,
						...resultOne[sourceNumber - 1]
							.metadata,
					};

					console.log(
						JSON.stringify(
							modifiedMetadata
						) + "\n"
					);
				}

				askQuestion();
			}
		}
	);
};

// Call the run function
run().catch(console.error);
