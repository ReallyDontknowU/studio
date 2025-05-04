
'use server';

import fs from 'fs/promises';
import path from 'path';

// Define the expected structure of the response from the action
interface ActionResult {
    success: boolean;
    error?: string;
}

export async function saveApiKeyAction(apiKey: string): Promise<ActionResult> {
    // Basic validation on the server side
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
        return { success: false, error: 'Invalid API Key provided.' };
    }

    // SECURITY WARNING: This approach modifies the .env file directly.
    // This is generally NOT recommended for production environments.
    // Environment variables should ideally be managed through deployment platform settings.
    // Use with extreme caution and only in controlled development environments.

    const envFilePath = path.resolve(process.cwd(), '.env');
    const envVarName = 'GOOGLE_GENAI_API_KEY';

    try {
        let envFileContent = '';
        try {
            // Try reading the existing .env file
            envFileContent = await fs.readFile(envFilePath, 'utf-8');
        } catch (readError: any) {
            if (readError.code !== 'ENOENT') {
                // If the error is something other than "file not found", re-throw it.
                throw readError;
            }
            // If file doesn't exist, we'll create it.
            console.log('.env file not found, will create a new one.');
        }

        const lines = envFileContent.split('\n');
        let keyFound = false;
        const updatedLines = lines.map(line => {
            // Trim the line and check if it starts with the variable name followed by '='
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith(`${envVarName}=`)) {
                keyFound = true;
                // Update the line with the new key
                return `${envVarName}=${apiKey}`;
            }
            return line; // Keep other lines as they are
        });

        // If the key was not found, add it as a new line
        if (!keyFound) {
            updatedLines.push(`${envVarName}=${apiKey}`);
        }

        // Join the lines back, ensuring no excessive blank lines at the end
        const updatedEnvFileContent = updatedLines.filter(line => line.trim() !== '' || keyFound).join('\n').trim() + '\n';

        // Write the updated content back to the .env file
        await fs.writeFile(envFilePath, updatedEnvFileContent, 'utf-8');

        console.log('Successfully updated GOOGLE_GENAI_API_KEY in .env file.');
        return { success: true };

    } catch (error: any) {
        console.error('Error writing to .env file:', error);
        return { success: false, error: `Failed to save API key: ${error.message}` };
    }
}
