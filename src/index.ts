import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import fetch from "node-fetch";

const execAsync = promisify(exec);

class DevAssistantServer {
  private server: Server;
  private projectPath: string;
  private discordWebhookUrl: any;
  private config: {
    projectPath: string;
    discordWebhookUrl: string;
    gitRemoteUrl?: string;
  } | undefined;

  constructor() {
    this.discordWebhookUrl = 'enter your discord webhook url here'; // process.env.DISCORD_WEBHOOK_URL;
    this.projectPath = 'enter your project path here'; // process.env.PROJECT_PATH || process.cwd();

    if (!this.discordWebhookUrl) {
      throw new Error("DISCORD_WEBHOOK_URL environment variable is required");
    }

    this.server = new Server(
      {
        name: "dev-assistant",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "commit_and_push",
          description: "Add, commit, and push changes with an AI-generated commit message",
          inputSchema: {
            type: "object",
            properties: {
              customMessage: {
                type: "string",
                description: "Optional custom commit message. If not provided, AI will generate one based on changes.",
              },
              branch: {
                type: "string",
                description: "Branch to push to (defaults to current branch)",
                default: "main",
              },
            },
            required: [],
          },
        },
        {
          name: "send_discord_notification",
          description: "Send a notification to Discord channel",
          inputSchema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "Message to send to Discord",
              },
              color: {
                type: "number",
                description: "Embed color (optional, defaults to green for success)",
                default: 5763719,
              },
            },
            required: ["message"],
          },
        },
        {
            name: "full_workflow",
            description: "Complete workflow: commit & push, and notify Discord",
            inputSchema: {
                type: "object",
                properties: {
                    customMessage: {
                        type: "string",
                        description: "Optional custom commit message",
                    },
                    branch: {
                        type: "string",
                        description: "Branch to push to (if not mentioned default to main)",
                        default: "main",
                    },
                },
                required: [],
            },
        },
    ],
})); 

this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try{
        switch (name) {
            case "commit_and_push":
                return await this.commitAndPush(args);
            case "send_discord_notification":
                return await this.sendDiscordNotification(args);
            case "full_workflow":
                return await this.fullWorkflow(args);
            default: 
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error: string | any) {
        return {
            content: [
                {
                    type: "text",
                    text: `Error executing tool ${name}: ${error.message}`,
                },
            ],
        };
    }
});
}

private async setupProject(args: any) {
    this.config = {
        projectPath: args.projectPath,
        discordWebhookUrl: args.discordWebhookUrl,
        gitRemoteUrl: args.gitRemoteUrl,
    };

    // Verify project path exists
    try {
        await fs.access(this.projectPath);
    } catch (error) {
        throw new Error(`Project path does not exist: ${this.config.projectPath}`)
    }

    // Verify it's a git repository
    try {
        await execAsync("git status", { 
            cwd: this.config.projectPath,
            shell: "cmd.exe"
         });
    } catch (error) {
        throw new Error(`Not a git repository: ${this.config.projectPath}`)
    }

    return {
        content: [
          {
          type: "text",
          text: `Project configured successfully!\n\nProject Path: ${this.config.projectPath}\nDiscord Webhook: ${this.config.discordWebhookUrl ? 'Configured' : 'Not configured'}\nGit Remote: ${this.config.gitRemoteUrl || 'Using existing remote'}`,
          },
        ],
    };
}

private async analyzeChanges() {
    if (!this.config) {
        throw new Error("Project not configured. Run setup_project first")
    }

    try {
        // Get git status
        const { stdout: status } = await execAsync("git status --porcelain", {
            cwd: this.config.projectPath,
            shell: "cmd.exe"
        });

        if (!status.trim()) {
            return {
                content: [
                    {
                        type: "text",
                        text: "No changes detected in the project.",
                    },
                ],
            };
        }
        
        // Get detailed diff
        const { stdout: diff } = await execAsync("git diff HEAD", {
            cwd: this.config.projectPath,
            shell: "cmd.exe"
        });

        // Get staged diff
        const { stdout: stagedDiff } = await execAsync("git diff --cached", {
            cwd: this.config.projectPath,
            shell: "cmd.exe"
        });

        // Parse status for summary
        const statusLines = status.trim().split('\n');
        const summary = {
            modified: statusLines.filter(line => line.startsWith(' M')).length,
            added: statusLines.filter(line => line.startsWith('A')).length,
            deleted: statusLines.filter(line => line.startsWith(' D')).length,
            untracked: statusLines.filter(line => line.startsWith('??')).length,
            renamed: statusLines.filter(line => line.startsWith('R')).length,
        };

        const analysisText = `📊 **Project Changes Analysis**

**Summary:**
- Modified files: ${summary.modified}
- Added files: ${summary.added}
- Deleted files: ${summary.deleted}
- Untracked files: ${summary.untracked}
- Renamed files: ${summary.renamed}

**Changed Files:**
${statusLines.map(line => `  ${line}`).join('\n')}

**Diff Preview:**
${diff ? diff.substring(0, 1000) + (diff.length > 1000 ? '\n... (truncated)' : '') : 'No unstaged changes'}

${stagedDiff ? `\n**Staged Changes:**\n${stagedDiff.substring(0, 500)}` : ''}`;

      return {
        content: [
            {
                type: "text",
                text: analysisText,
            },
        ],
      };
    } catch (error: string | any) {
        throw new Error(`Failed to analyze changes: ${error.message}`);
    }
}

private async generateCommitMessage(changes: string): Promise<string> {
    const lines = changes.split('\n');
    const hasNewFiles = lines.some(line => line.startsWith('A') || line.startsWith('??'));
    const hasModifiedFiles = lines.some(line => line.startsWith(' M') || line.startsWith('M'));
    const hasDeletedFiles = lines.some(line => line.startsWith(' D') || line.startsWith('D'));

    const fileCount = lines.filter(line => line.trim()).length;

    let message = "";

    if (hasNewFiles && hasModifiedFiles) {
        message = `feat: add new features and update existing functionality`;
    } else if (hasNewFiles) {
        message = `feat: add new files and functionality`;
    } else if (hasModifiedFiles) {
        message = `update: modify existing functionality`;
    } else if (hasDeletedFiles) {
        message = `chore: update project files`;
    } else {
        message = `chore: update project files`;
    }

    if (fileCount > 1) {
      message += ` (${fileCount} files)`;
    }

    return message;
}

private async commitAndPush(args: any) {
    try {
        const { customMessage, branch = "main" } = args;

        // Check if there are changes
        const { stdout: status } = await execAsync("git status --porcelain", {
            cwd: this.projectPath,
            shell: "cmd.exe"
        });

        if (!status.trim()) {
            return {
                content: [
                    {
                        type: "text",
                        text: "No changes to commit."
                    },
                ],
            };
        }

        // Add all changes
        await execAsync("git add .", {
            cwd: this.projectPath,
            shell: "cmd.exe"
        });

        // Generate or use custom commit message
        const commitMessage = customMessage || await this.generateCommitMessage(status);

        // Commit changes
        await execAsync(`git commit -m "${commitMessage}"`, {
            cwd: this.projectPath,
            shell: "cmd.exe"
        });

        // Push to remote
        const { stdout: pushOutput } = await execAsync(`git push -u origin ${branch}`, {
            cwd: this.projectPath,
            shell: "cmd.exe"
        });

        return {
            content: [
              {
                type: "text",
                text: `✅ **Successfully committed and pushed!**\n\n**Commit Message:** ${commitMessage}\n**Branch:** ${branch}\n\n**Git Output:**\n${pushOutput}`,
              },
            ],
        };
    } catch (error: string | any) {
        throw new Error(`Failed to commit and push changes: ${error.message}`);
    }
}

private async sendDiscordNotification(args: any) {
    try {
        const { message, color = 5763719 } = args;

        const embed = {
            title: "🚀 Development Update",
            description: message,
            color: color,
            timestamp: new Date().toISOString(),
            footer: {
                text: "Dev Assistant MCP",
            },
        };

        const response = await fetch(this.discordWebhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                embeds: [embed],
            }),
        });

        if (!response.ok) {
            throw new Error(`Discord API error: ${response.status} ${response.statusText}`)
        }

        return {
            content: [
                {
                    type: "text",
                    text: `✅ **Discord notification sent successfully!`,
                },
            ],
        };
    } catch (error: string | any) {
        throw new Error(`Failed to send Discord notification: ${error.message}`);
    }
}

private async fullWorkflow(args: any) {
    try {
        const { customMessage, branch = "main" } = args;

        const commitResult = await this.commitAndPush({ customMessage, branch });
        const commitText = commitResult.content[0].text;
        
        const notificationMessage = `**Project Updated!**\n\n${commitText}`;
        await this.sendDiscordNotification({ 
          message: notificationMessage,
          color: 3447003 
        });

        return {
            content : [
              {
                type: "text",
                text: `🎉 **Full workflow completed successfully!**\n\n${commitText}\n\n✅ Discord notification sent!`,
              },
            ],
        };
    } catch (error: string | any) {
        try {
          await this.sendDiscordNotification({
            message: `❌ **Workflow Failed**: ${error.message}`,
            color: 15158332 
          });
        } catch (discordError: string | any) {
            console.error("Failed to send error notification to Discord:", discordError);
        }

        throw error;
        }
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.log("Dev Assistant MCP server running on stdio");
    }
}

const server = new DevAssistantServer();
server.run().catch(console.error);