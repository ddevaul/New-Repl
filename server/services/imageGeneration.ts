import { config } from "../config.js";

const PLACEHOLDER_IMAGE = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgdmlld0JveD0iMCAwIDUxMiA1MTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjUxMiIgaGVpZ2h0PSI1MTIiIGZpbGw9IiNmNGY0ZjUiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzZiNzI4MCIgZm9udC1mYW1pbHk9InN5c3RlbS11aSwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNHB4Ij5HZW5lcmF0aW5nIGltYWdlLi4uPC90ZXh0Pjwvc3ZnPg==";

export async function generateImage(prompt: string): Promise<string> {
  try {
    if (!process.env.STABILITY_API_KEY) {
      console.warn('STABILITY_API_KEY is not set - using placeholder image');
      return PLACEHOLDER_IMAGE;
    }

    console.log('Generating image with prompt:', prompt);

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
      const errorText = await response.text().catch(() => response.statusText);
      console.error('Stability AI API error:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText
      });

      if (response.status === 401) {
        throw new Error('Invalid API key - please check your Stability AI API key');
      } else if (response.status === 429) {
        throw new Error('Rate limit exceeded - please try again later');
      } else {
        throw new Error(`API error (${response.status}): ${errorText}`);
      }
    }

    const responseData = await response.json();
    if (!responseData.artifacts?.[0]?.base64) {
      console.error('Invalid response format:', responseData);
      throw new Error('Received invalid response format from Stability AI');
    }

    console.log('Successfully generated image');
    return `data:image/png;base64,${responseData.artifacts[0].base64}`;
  } catch (error) {
    console.error('Image generation failed:', error);
    
    // Return a placeholder image instead of throwing
    // This allows the game to continue even if image generation fails
    return PLACEHOLDER_IMAGE;
  }
}
