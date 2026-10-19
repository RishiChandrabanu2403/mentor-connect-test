# Mentor Connect

A web application that helps students discover suitable mentors based on their interests, career goals, and areas of expertise.

## Features

- **Mentor Matching:** Recommends mentors based on a student's query and relevant expertise.
- **Mentor Profiles:** Displays mentor information and areas of specialisation.
- **Booking Workflow:** Supports mentoring session booking and status management.
- **Role-Based Views:** Provides interfaces for student, mentor, and admin workflows.

## Tech Stack

- React
- Vite
- JavaScript
- CSS
- Supabase

## Getting Started

### Prerequisites

- Node.js and npm
- Supabase project credentials, if required by the configured application

### Installation

Clone the repository:

```bash
git clone https://github.com/RishiChandrabanu2403/mentor-connect-test.git
cd mentor-connect-test
npm install
```

Configure the required environment variables in a local `.env.local` file. Do not commit credentials or secret keys.

Start the development server:

```bash
npm run dev
```

Open the local URL printed in the terminal.

## Project Structure

- `src/` — React application components, styles, and Supabase integration
- `public/` — Public assets and CSV data files
- `package.json` — Dependencies and scripts

## Notes

This project was developed as a technical assignment. Features requiring external services depend on the corresponding configuration and permissions.
