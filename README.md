# Argonaut

> 🌐 **Runs on localhost** — once setup is complete, the app opens on your local machine. Just click the link that appears in your terminal and it'll open in your browser, running locally on your machine.

Quick setup guide to get Argonaut running on your machine.

The tested deployment is also available at [here](https://argonautsim-382548405389.us-central1.run.app/). More details of Argonaut can be found [here](https://github.com/TDI-Lab/Argonaut-Documentation).

---

## 🚀 Quick Start

> **4 quick steps** — pick your operating system below and follow along.
>
> 📥 Getting the code will take about **a minute**. Running the remaining steps should take **no more than 5 minutes**.

### 📦 Get the Code

**Option A — Clone with Git**
```bash
git clone https://github.com/TDI-Lab/Argonaut.git
cd Argonaut
```

**Option B — Download the ZIP**

Download it directly from [github.com/TDI-Lab/Argonaut](https://github.com/TDI-Lab/Argonaut) → **Code → Download ZIP**, then extract it and open a terminal in that folder.

---

### 🍎 macOS

> **Step 1 — Install Homebrew** *(this is the command to install Homebrew, the macOS package manager)*
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

> **Step 2 — Install dependencies**
```bash
brew install openjdk@17 maven node python git && pip3 install numpy pandas matplotlib
```

> **Step 3 — Make the quickstart script executable**
```bash
chmod +x quickstart.sh
```

> **Step 4 — Run it**
```bash
./quickstart.sh
```

---

### 🐧 Linux (Debian/Ubuntu)

> **Step 1 — Install dependencies**
```bash
sudo apt update && sudo apt install -y openjdk-17-jdk maven git python3 python3-pip python3-numpy python3-pandas python3-matplotlib && curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
```

> **Step 2 — Make the quickstart script executable**
```bash
chmod +x quickstart.sh
```

> **Step 3 — Run it**
```bash
./quickstart.sh
```

---

### 🪟 Windows

> **Step 1 — Download the packages**
```powershell
winget install --id EclipseAdoptium.Temurin.17.JDK -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Python.Python.3.12 -e
```

> **Step 2 — Run in PowerShell**
```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\quickstart.ps1
```

> **Step 3 — Stop the run in PowerShell**
```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\stop-windows.ps1
```

---

> 🌐 **Note:** Once `quickstart` finishes running, it will start a **local host** server. Click the link shown in your terminal to open Argonaut in your browser — it runs entirely on your local machine.

## 📋 Requirements

| Tool | Version |
|------|---------|
| Java (OpenJDK) | 17+ |
| Maven | Latest |
| Node.js | Latest LTS |
| Python | 3.x |
| Git | Latest |

## 🛠 Troubleshooting

If you run into issues during setup, please [open an issue](https://github.com/TDI-Lab/Argonaut/issues) in this repository.

---


