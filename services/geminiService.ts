
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { GeminiSceneResponseItem } from '../types.ts';
import { API_KEY, GEMINI_TEXT_MODEL, IMAGEN_MODEL } from '../constants.ts';

let ai: GoogleGenAI | null = null;

const getAI = () => {
  if (!API_KEY) {
    console.error("API_KEY is not set in environment variables.");
    throw new Error("API_KEY_MISSING");
  }
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: API_KEY });
  }
  return ai;
};

const IMAGEN_QUOTA_EXCEEDED_MESSAGE = "You've exceeded your Imagen API quota for image generation. Please check your Google AI plan and billing details, or try again later. Using placeholder image.";
const GENERIC_IMAGEN_ERROR_MESSAGE = "Failed to generate AI image due to an unexpected error or invalid prompt. Using placeholder image.";


export const analyzeNarrationWithGemini = async (
  narrationText: string,
  retries: number = 2
): Promise<GeminiSceneResponseItem[]> => {
  const genAI = getAI();
  const prompt = `
    You are an expert video scriptwriter. Your task is to process the following narration text and divide it into distinct scenes.
    For each scene, provide:
    1.  'sceneText': The exact text for that scene.
    2.  'keywords': An array of 2-3 relevant general keywords that are highly evocative and visually descriptive, capturing the core essence and mood of the scene. These keywords should be suitable for seeding an image search or generation.
        *   **CRITICAL FOR PLACEHOLDERS:** When AI-generated images are NOT used, these keywords are critical for selecting relevant placeholder images. Therefore, they must be concrete and descriptive enough for this purpose, even for abstract topics, to guide a random image service effectively.
    3.  'imagePrompt': A descriptive prompt (a short sentence or phrase, max 15-20 words) for an image generation model like Imagen. This prompt must be based on the sceneText and keywords.
        *   **CRITICAL FOR ACCURACY:** The prompt must translate the core message and *implied visuals* of the scene into a concrete, imaginative image concept.
        *   If the scene text describes abstract concepts (e.g., power, influence, data, economy, crisis, control, surveillance, global finance), the imagePrompt **MUST** suggest strong visual metaphors or symbolic representations for these concepts. For example:
            *   "Global influence of a company" could be: 'A shadowy, imposing skyscraper silhouette looming over a stylized globe, with faint financial data streams connecting them. Dark, serious tones.' OR 'A single, powerful chess piece (e.g., queen or king) subtly manipulating other pieces on a global map chessboard.'
            *   "Data surveillance" could be: 'A futuristic interface displaying complex financial charts, with a subtle overlay of a giant digital eye scanning code.' OR 'Glowing data streams forming an intricate, glowing web around silhouetted figures.'
            *   "Economic crisis" could be: 'A crumbling, classical financial building with storm clouds overhead.' OR 'A stormy sea with stylized paper boats (representing businesses) struggling in turbulent waves.'
            *   "Hidden control" could be: 'Puppet strings subtly leading from an unseen source to various symbols of industry and government.'
        *   The prompt should be detailed enough for an image generation model to create a visually representative and thematically relevant image.
        *   Avoid using direct quotes from the scene text. Focus on creating a *new visual interpretation* of the scene's meaning that is compelling and clear.
        *   Ensure the imagePrompt is concise and focuses on a single, strong visual idea.
    4.  'duration': An estimated duration for the scene in seconds, based on an average reading speed of approximately 3 words per second. Scenes should ideally be between 4 and 15 seconds.
        *   Long narrations MUST be broken into as many scenes as needed so no single scene exceeds 15 seconds. It is normal to produce dozens of scenes for a 7-17 minute script. Never cap the number of scenes at an arbitrary limit.

    Narration:
    "${narrationText}"

    Return the output as a valid JSON array of objects. Each object in the array MUST follow this exact structure:
    { "sceneText": "string", "keywords": ["string", "string"], "imagePrompt": "string", "duration": number }

    CRITICAL JSON FORMATTING RULES:
    - The entire response MUST be a single JSON array. Do NOT include any explanatory text, comments, or markdown formatting (like \`\`\`json) before or after the JSON array itself.
    - Each key-value pair within an object (e.g., "sceneText": "value") MUST be followed by a comma if it is NOT the last pair in that object.
    - The last key-value pair in an object MUST NOT have a comma after it.
    - Strings, especially for 'sceneText' and 'imagePrompt', MUST be properly escaped. For example, if a quote (") needs to be part of the string, it must be escaped as \\". Newlines within strings should be represented as \\n.
    - Ensure all strings are enclosed in double quotes.
    - There should be no trailing commas after the last element in an array or the last property in an object.

    Example of a VALID JSON response for conceptual content:
    [
      {
        "sceneText": "A shadowy organization pulls the strings of global markets, their influence unseen but pervasive.",
        "keywords": ["shadow finance", "global control", "hidden influence"],
        "imagePrompt": "Dark, silhouetted hands from above manipulating intricate puppet strings connected to Wall Street bull and bear symbols.",
        "duration": 7
      },
      {
        "sceneText": "Their advanced AI, Aladdin, processes vast amounts of data, predicting market shifts with uncanny accuracy.",
        "keywords": ["AI surveillance", "data analysis", "market prediction"],
        "imagePrompt": "Glowing, abstract network of data streams flowing into a central, stylized brain icon, with stock tickers in the background.",
        "duration": 8
      }
    ]

    If the narration is very short, it can be a single scene. Break longer sentences or paragraphs into multiple logical scenes if appropriate.
    Ensure the 'imagePrompt' is concise and focuses on creating a compelling and thematically relevant visual.
  `;

  let geminiApiResponse: GenerateContentResponse | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      geminiApiResponse = await genAI.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.5,
        }
      });
      break;
    } catch (err) {
      if (
        attempt < retries &&
        err instanceof Error &&
        (err.message.includes("UNAVAILABLE") || err.message.includes("503"))
      ) {
        await new Promise(res => setTimeout(res, 1000 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }

  if (!geminiApiResponse) {
    throw new Error("Failed to analyze narration. The AI service is unavailable.");
  }

  try {
    let jsonStr = geminiApiResponse?.text?.trim() || '';
    const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
    const match = jsonStr.match(fenceRegex);
    if (match && match[2]) {
      jsonStr = match[2].trim();
    }

    const parsedData = JSON.parse(jsonStr) as GeminiSceneResponseItem[];

    if (!Array.isArray(parsedData) || parsedData.some(item =>
        typeof item.sceneText !== 'string' ||
        !Array.isArray(item.keywords) || // Keywords must be an array
        typeof item.imagePrompt !== 'string' || 
        typeof item.duration !== 'number' ||
        item.keywords.some(k => typeof k !== 'string')
    )) {
      console.error("Gemini response does not match expected structure after parsing:", parsedData);
      throw new Error("Invalid data structure received from AI. The AI's response, while valid JSON, did not match the expected format of scene objects (missing or incorrect sceneText, keywords, imagePrompt, or duration).");
    }

    return parsedData;

  } catch (error) {
    console.error("Error analyzing narration with Gemini:", error);
    if (error instanceof Error) {
        if (error.message === "API_KEY_MISSING") {
             throw new Error("Gemini API key is not configured. Please set the API_KEY environment variable.");
        }
        if (error.message.includes("API key not valid") || error.message.includes("PERMISSION_DENIED")){
            throw new Error("Invalid Gemini API Key. Please check your API_KEY environment variable.");
        }
        if (error.message.includes("NOT_FOUND") || error.message.includes("not found")) {
            throw new Error("The configured Gemini model is unavailable. Please update GEMINI_TEXT_MODEL to a supported model.");
        }
        if (error.message.includes("RESOURCE_EXHAUSTED") || error.message.includes("429")) {
            throw new Error("You've exceeded your Gemini API quota for text generation. Please check your Google AI plan and billing details.");
        }
        if (error instanceof SyntaxError) { 
            console.error("Raw Gemini response text that caused syntax error:", geminiApiResponse?.text);
            throw new Error(`The AI returned malformed JSON, causing a parsing error. Details: ${error.message}`);
        }
         // Check if the error message indicates a problem with the prompt itself, which might happen if the AI can't process the input.
        if (error.message.includes("prompt") && (error.message.includes("blocked") || error.message.includes("invalid"))) {
            throw new Error("The AI could not process the narration, it might have been too short, unclear, or contained problematic content. Please revise your narration.");
        }
    }
    throw new Error(`Failed to analyze narration. The AI service might be temporarily unavailable or the input was problematic. Details: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const generateImageWithImagen = async (prompt: string, sceneIdForLog: string): Promise<{ base64Image: string; userFriendlyError?: string }> => {
  const genAI = getAI();
  try {
    const response = await genAI.models.generateImages({
        model: IMAGEN_MODEL,
        prompt: prompt,
        config: { numberOfImages: 1, outputMimeType: 'image/jpeg' }, // jpeg is often smaller
    });

    if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0].image?.imageBytes) {
      const base64ImageBytes = response.generatedImages[0].image.imageBytes;
      return { base64Image: `data:image/jpeg;base64,${base64ImageBytes}` };
    } else {
      console.warn(`Imagen response for scene ${sceneIdForLog} did not contain expected image data. Prompt: "${prompt}"`, response);
      return { base64Image: '', userFriendlyError: `Imagen returned no image for scene ${sceneIdForLog}. Using placeholder.` };
    }
  } catch (error) {
    console.error(`Error generating image with Imagen for scene ${sceneIdForLog} (prompt: "${prompt}"):`, error);
    let userFriendlyError = GENERIC_IMAGEN_ERROR_MESSAGE;
    if (error instanceof Error) {
        if (error.message.includes("API key not valid") || error.message.includes("PERMISSION_DENIED")){
           userFriendlyError = "Invalid API Key for Imagen. Using placeholder.";
        } else if (error.message.includes("RESOURCE_EXHAUSTED") || error.message.includes("quota") || error.message.includes("429")) {
            userFriendlyError = IMAGEN_QUOTA_EXCEEDED_MESSAGE;
        } else if (error.message.includes("prompt") && (error.message.includes("blocked") || error.message.includes("invalid"))) {
            userFriendlyError = `The image prompt for scene ${sceneIdForLog} ("${prompt.substring(0,50)}...") was considered unsafe or invalid by the AI. Using placeholder.`;
        }
    }
    return { base64Image: '', userFriendlyError };
  }
};
