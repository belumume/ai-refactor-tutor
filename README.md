# AI Code Refactor Tutor

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Live Demo:** [https://ai-refactor-tutor.vercel.app/](https://ai-refactor-tutor.vercel.app/)

A web application built for the Next.js Global Hackathon that uses AI to provide refactoring suggestions for JavaScript/React code snippets. Enter your code, get AI-powered advice, and even apply some common fixes directly!

![Screenshot of App](https://i.imgur.com/8Ik3DhL.png)
*(Feel free to update the screenshot if needed)*

## Features

* Paste JavaScript or React code snippets into a text area.
* Click "Analyze Code" to send the snippet to an AI model (Anthropic Claude).
* Receive AI-generated refactoring suggestions (requesting structured `type` and `params`).
* **Apply common suggestions** (like variable/function renames, template literals, operator shortcuts, valid const usage) directly using programmatic AST manipulation via Babel.
* Copy the modified code to the clipboard.
* Clean, responsive UI built with Next.js and Tailwind CSS.
* Loading and error states for user feedback.
* Uses `lucide-react` for icons.

## Tech Stack

* **Framework:** Next.js 15+ (App Router)
* **Language:** TypeScript
* **Styling:** Tailwind CSS
* **AI:** Anthropic Claude API (using model `claude-3-7-sonnet-20250219`)
* **AI SDK:** `@anthropic-ai/sdk`
* **AST Manipulation:** `@babel/parser`, `@babel/traverse`, `@babel/generator`, `@babel/types`
* **UI:** React, `lucide-react`
* **Deployment:** Vercel

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

* Node.js (v18 or later recommended)
* npm or yarn

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/belumume/ai-refactor-tutor.git](https://www.google.com/search?q=https://github.com/belumume/ai-refactor-tutor.git)
    cd ai-refactor-tutor
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    # or
    # yarn install
    ```
3.  **Set up Environment Variables:**
    * Create a file named `.env.local` in the root directory of the project.
    * Add your Anthropic API key to this file:
        ```plaintext
        ANTHROPIC_API_KEY=your_anthropic_api_key_here
        ```
    * **Important:** Ensure `.env.local` is listed in your `.gitignore` file to avoid committing your secret key.

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
5.  Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## How to Use

1.  Navigate to the application (live URL or localhost).
2.  Paste a snippet of JavaScript or React code into the text area.
3.  Click the "Analyze Code" button.
4.  Wait for the AI suggestions to appear.
5.  Review the suggestions and explanations.
6.  Click the "Apply Fix" button next to a suggestion you want to apply (works for implemented types like renames, template literals, etc.). The code in the text area will update.
7.  Click the "Copy Code" button to copy the current code from the text area.

## Potential Future Improvements

* Implement AST transformations for more suggestion types (e.g., replacing loops with array methods).
* Add syntax highlighting to the input area.
* Support for more programming languages.
* Improve robustness of suggestion interpretation and AST modification.
* Add a diff view to show changes before applying.
* Implement user accounts and history.

## Hackathon

This project was created for the [Next.js Global Hackathon](https://next-hackathon-2025.vercel.app/) (AI Theme).

## License

This project is licensed under the MIT License. *(Suggestion: Add a LICENSE file with the MIT license text to your repo if you haven't)*

