import { config } from "../config.js";

export async function generateImage(prompt: string): Promise<string> {
  try {
    if (!process.env.STABILITY_API_KEY) {
      throw new Error('STABILITY_API_KEY is not set');
    }

    const response = await fetch(
      `https://api.stability.ai/v1/generation/${config.stabilityApi.engineId}/text-to-image`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${process.env.STABILITY_API_KEY}`,
        },
        body: JSON.stringify({
          text_prompts: [{ text: prompt }],
          cfg_scale: 7,
          height: config.stabilityApi.imageHeight,
          width: config.stabilityApi.imageWidth,
          samples: config.stabilityApi.samples,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Stability AI API error: ${response.statusText}`);
    }

    const responseData = await response.json();
    if (!responseData.artifacts?.[0]?.base64) {
      throw new Error('No image data received from Stability AI');
    }

    return `data:image/png;base64,${responseData.artifacts[0].base64}`;
  } catch (error) {
    console.error('Image generation failed:', error);
    throw new Error('Failed to generate image');
  }
}
