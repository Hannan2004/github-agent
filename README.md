# 🚀 Dev Assistant – Your AI-Powered Git Workflow Companion

Dev Assistant is a **Model Context Protocol (MCP) server** designed to revolutionize the way developers interact with Git workflows using natural language. Seamlessly integrated with Claude Desktop (or any MCP-compatible client), it automates code commits, pushes, and team communication—so you can focus more on writing great code and less on managing it.

---

## 💡 Why Dev Assistant?

### Common Developer Pain Points:

* Memorizing complex Git commands
* Writing meaningful commit messages quickly
* Keeping team members updated manually
* Constant context switching between coding and communication

### Dev Assistant Solves This By:

* 🔍 **Analyzing Git changes** in your repo automatically
* ✍️ **Generating commit messages** using Claude AI
* 📤 **Pushing to GitHub** with natural language commands
* 📢 **Notifying your team** via Discord integration
* 🤝 **Keeping everyone in sync**, effortlessly

---

## 🛠️ How It Works

1. You make changes in your local Git repository
2. You issue a natural language command to your MCP client (e.g. Claude Desktop)

   > *"Push my changes with a commit about fixing the login bug"*
3. Dev Assistant:

   * Analyzes the changes
   * Suggests a smart commit message
   * Runs `git add .`, `git commit`, and `git push`
   * Sends updates to your configured Discord channel

---

## 🔧 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/Hannan2004/github-agent.git
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Project

```bash
npm run build
```

### 4. Connect to an MCP Client

Dev Assistant is now ready to be used with any MCP-compatible client such as **Claude Desktop**. Start issuing commands in natural language and watch your Git workflow automate itself!
