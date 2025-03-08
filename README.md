# Cinedle

A movie guessing game inspired by Wordle, where players try to guess a secret movie based on common cast and crew members.

## Features

- Daily random movie to guess
- Search for movies using TMDB database
- See common cast and crew members between your guess and the target movie
- Modern UI inspired by TMDB's design

## Setup

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Get a TMDB API key:
   - Go to [TMDB website](https://www.themoviedb.org/)
   - Create an account and request an API key
   - Copy your API key

4. Create a `.env` file in the root directory:
   ```bash
   cp .env.example .env
   ```
   Then replace `your_tmdb_api_key_here` with your actual TMDB API key

5. Start the development server:
   ```bash
   npm run dev
   ```

## How to Play

1. The game selects a random popular movie as the target
2. Type a movie title in the search box to make a guess
3. After each guess, you'll see:
   - Common cast members between your guess and the target movie
   - Common crew members between your guess and the target movie
4. Keep guessing until you find the correct movie!

## Technologies Used

- React
- TypeScript
- Vite
- Material-UI
- TMDB API
