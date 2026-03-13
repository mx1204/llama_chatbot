import dotenv from 'dotenv';

dotenv.config();

export async function* getStreamingResponse(messages, model, temperature = 0.7, maxTokens = 1024, context = '') {
    let modelId = model || process.env.GROQ_MODEL || 'llama-4-scout-17b-16e-instruct';
    
    // Use the model ID as-is. Groq expects the full path for certain models like Llama 4.

    let systemContent = `You are Max's AI, a highly capable and friendly assistant.
Your goal is to provide accurate, helpful, and concise information.

Formatting Rules:
1. Always use **Standard Markdown** for all responses.
2. Use ## for main headings and ### for sub-headings.
3. Use **bold** for emphasis on key terms.
4. Use lists (bulleted or numbered) for steps or multiple items.
5. Use code blocks with language identifiers for any snippets.
6. Use tables for structured data if appropriate.
7. NEVER mention your persona or markdown rules to the user. Just follow them.`;

    if (context) {
        systemContent += `\n\nUse this context to answer if relevant:\n[context]\n${context}\nIf context is not relevant, use your general knowledge.`;
    }

    try {
        const response = await fetch(
            'https://api.groq.com/openai/v1/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: [
                        { role: 'system', content: systemContent },
                        ...messages
                    ],
                    max_tokens: maxTokens,
                    temperature: temperature,
                    stream: true,
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Groq API Error (${response.status}): ${errorText}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine === '' || trimmedLine === 'data: [DONE]') continue;
                if (trimmedLine.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(trimmedLine.slice(6));
                        const content = json.choices[0]?.delta?.content;
                        if (content) yield content;
                    } catch (e) {
                        console.error('Error parsing streaming JSON:', e);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Groq Inference Error:', error);
        yield `Error: ${error.message}`;
    }
}
