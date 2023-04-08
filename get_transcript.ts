import puppeteer from "puppeteer";

// Replace with the URL of the YouTube video
export async function getTranscript(url: string){
	return new Promise(async (resolve, reject) => {
		const browser = await puppeteer.launch({ headless: true });
		const page = await browser.newPage();

		await page.goto(url);

		// Click the button to show the transcript
		const moreActionsButton =
			'yt-button-shape > button[aria-label="More actions"]';
		await page.waitForSelector(moreActionsButton);
		await page.click(moreActionsButton);

		console.log("clicked moreActionsButton");

		page.on("request", async (request) => {
			if (
				request
					.url()
					.includes("/youtubei/v1/get_transcript")
			) {
				console.log(request.url());
				const response = await page.waitForResponse(
					(res) =>
						res
							.url()
							.includes(
								"/youtubei/v1/get_transcript"
							)
				);
				const transcript = await response.json();

				const initialSegments =
					transcript.actions[0]
						.updateEngagementPanelAction
						.content.transcriptRenderer
						.content
						.transcriptSearchPanelRenderer
						.body
						.transcriptSegmentListRenderer
						.initialSegments;

				let finalTranscript = "";
				for (const segment of initialSegments) {
					finalTranscript +=
						segment
							.transcriptSegmentRenderer
							.snippet.runs[0].text +
						" ";
				}

				await browser.close();

				resolve(finalTranscript);
			}
		});

		const showTranscriptButton =
			"ytd-menu-popup-renderer ytd-menu-service-item-renderer:last-child";
		await page.waitForSelector(showTranscriptButton);
		await page.click(showTranscriptButton);

		console.log("clicked showTranscriptButton");

                return("error")
	});
}
