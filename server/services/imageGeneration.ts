import { config } from "../config.js";

export const PLACEHOLDER_IMAGE = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgdmlld0JveD0iMCAwIDUxMiA1MTIiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjUxMiIgaGVpZ2h0PSI1MTIiIGZpbGw9IiNmNGY0ZjUiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iIzZiNzI4MCIgZm9udC1mYW1pbHk9InN5c3RlbS11aSwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNHB4Ij5HZW5lcmF0aW5nIGltYWdlLi4uPC90ZXh0Pjwvc3ZnPg==";

export async function generateImage(prompt: string): Promise<string> {
  try {
    const apiKey = process.env.STABILITY_API_KEY;
    
    console.log('Debug - Generating image with prompt:', { prompt });

    if (!apiKey || apiKey.trim() === '') {
      console.warn('STABILITY_API_KEY is not set or empty - using placeholder image');
      return PLACEHOLDER_IMAGE;
    }

    const response = await fetch(
      `https://api.stability.ai/v1/generation/${config.stabilityApi.engineId}/text-to-image`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          text_prompts: [{ 
            text: `A simple, clear illustration of ${prompt}. Minimalist style, clean lines, white background.`
          }],
          cfg_scale: 7,
          height: 512,
          width: 512,
          samples: 1,
          style_preset: "pixel-art"
        }),
      }
    );

    if (!response.ok) {
      let errorDetails;
      try {
        const errorText = await response.text();
        errorDetails = JSON.parse(errorText);
      } catch (e) {
        errorDetails = { message: response.statusText };
      }

      console.error('Stability AI API error:', {
        status: response.status,
        statusText: response.statusText,
        errorDetails
      });

      throw new Error(`API error (${response.status}): ${errorDetails.message || 'Unknown error'}`);
    }

    const responseData = await response.json();
    if (!responseData.artifacts?.[0]?.base64) {
      throw new Error('Received invalid response format from Stability AI');
    }

    const imageData = Buffer.from(responseData.artifacts[0].base64, 'base64');
    
    // Process and store the image
    const key = `generated/${Date.now()}-${prompt.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
    const imageUrl = await processAndStoreImage(prompt, imageData);

    console.log('Successfully generated and stored image:', { prompt, key });
    return imageUrl;
  } catch (error) {
    console.error('Image generation failed:', error);
    return PLACEHOLDER_IMAGE;
  }
}
