# AI Code Refactor Tutor

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A web application built for the Next.js Global Hackathon that uses AI to provide refactoring suggestions for JavaScript/React code snippets. Enter your code, and get AI-powered advice on how to improve its readability, maintainability, and adherence to best practices.

![Screenshot of App](https://i.imgur.com/M1ZwGBh.png)

## Features

* Paste JavaScript or React code snippets into a text area.
* Click "Analyze Code" to send the snippet to an AI model (Anthropic Claude).
* Receive AI-generated refactoring suggestions with explanations.
* Clean, responsive UI built with Next.js and Tailwind CSS.
* Loading and error states for user feedback.
* Uses `lucide-react` for icons.

## Tech Stack

* **Framework:** Next.js 14+ (App Router)
* **Language:** TypeScript
* **Styling:** Tailwind CSS
* **AI:** Anthropic Claude API (using model `claude-3-7-sonnet-20250219` - *confirm/update if you changed it*)
* **AI SDK:** `@anthropic-ai/sdk`
* **UI:** React, `lucide-react`

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

* Node.js (v18 or later recommended)
* npm or yarn

### Installation & Setup

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
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
    # or
    # yarn dev
    ```
5.  Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## How to Use

1.  Navigate to the application in your browser.
2.  Paste a snippet of JavaScript or React code into the text area.
3.  Click the "Analyze Code" button.
4.  Wait for the AI to process the code (a loading indicator will show).
5.  View the refactoring suggestions and explanations displayed below the input area.

## Potential Future Improvements

* Add syntax highlighting to the input area (using a compatible library/method).
* Support for more programming languages.
* Allow users to select specific refactoring rules or categories.
* Implement user accounts and history.
* Add functionality to directly apply suggested changes.

## Hackathon

This project was created for the [Next.js Global Hackathon](https://next-hackathon-2025.vercel.app/) (AI Theme).

## License

This project is licensed under the MIT License - see the LICENSE file for details (if you choose to add one).
