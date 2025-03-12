import axios from 'axios';
import { Movie, Genre, ProductionCompany, Cast, Crew, MovieBasic } from '../config/tmdb';
import Fuse from 'fuse.js';
import { movieList } from '../data/movieList.ts';

const api = axios.create({
    baseURL: 'https://api.themoviedb.org/3',
    headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_TMDB_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
    },
});

// Keep the strict parameters for selecting the secret movie
export const MOVIE_POOL_PARAMS = {
    'sort_by': 'popularity.desc',
    'vote_count.gte': 5000,
    'vote_average.gte': 6.5,
    'with_original_language': 'en',
};

// Cache for movie pool to enable fuzzy search
let moviePoolCache: MovieBasic[] = [];

// Function to get the initial movie pool
const getMoviePool = async (): Promise<MovieBasic[]> => {
    if (moviePoolCache.length > 0) return moviePoolCache;

    try {
        const currentYear = new Date().getFullYear();
        const allMovies: MovieBasic[] = [];
        
        // Get movies from multiple pages to build a good pool
        for (let page = 1; page <= 5; page++) {
            const response = await api.get('/discover/movie', {
                params: {
                    ...MOVIE_POOL_PARAMS,
                    'primary_release_date.gte': '1990-01-01',
                    'primary_release_date.lte': `${currentYear}-12-31`,
                    page,
                },
            });
            
            allMovies.push(...response.data.results.map((movie: any) => ({
                id: movie.id,
                title: movie.title,
                release_date: movie.release_date,
                poster_path: movie.poster_path,
            })));
        }

        moviePoolCache = allMovies;
        return allMovies;
    } catch (error) {
        console.error('Failed to get movie pool:', error);
        return [];
    }
};

// Regular search function that searches all movies
export const searchMovies = async (query: string): Promise<MovieBasic[]> => {
    if (query.length < 2) return [];

    try {
        const response = await api.get('/search/movie', {
            params: {
                query: query,
                include_adult: false,
                'sort_by': 'popularity.desc',
                'page': 1,
                'per_page': 40
            }
        });

        // Add debugging
        console.log('Raw search results:', response.data.results);

        // Relaxed filtering
        const validResults = response.data.results.filter((movie: { 
            id: number;
            title: string;
            vote_count: number; 
            popularity: number;
            original_title?: string;
        }) => 
            movie.vote_count >= 50 && // Lowered from 100
            movie.popularity > 1      // Lowered from 5
        );

        console.log('Filtered results:', validResults);

        // Rest of the function remains the same...
        const fuseOptions = {
            includeScore: true,
            threshold: 0.6,
            distance: 100,
            minMatchCharLength: 2,
            keys: [
                { name: 'title', weight: 2 },
                { name: 'original_title', weight: 1 }
            ],
            shouldSort: true,
            location: 0,
            findAllMatches: true,
            ignoreLocation: true,
            isCaseSensitive: false,
            tokenize: true,
            matchAllTokens: false,
        };

        const fuse = new Fuse(validResults, fuseOptions);
        const exactMatches = validResults.filter((movie: { 
            title: string;
            original_title?: string;
        }) => {
            const movieTitle = movie.title.toLowerCase();
            const movieOriginalTitle = movie.original_title?.toLowerCase() || '';
            const searchQuery = query.toLowerCase();
            const queryWords = searchQuery.split(/\s+/);
            return queryWords.some(word => 
                movieTitle.includes(word) || 
                movieOriginalTitle.includes(word)
            );
        });

        const fuzzyResults = fuse.search(query);
        const fuzzyMatches = fuzzyResults
            .filter(result => result.score && result.score < 0.6)
            .map(result => result.item);

        const combinedResults = [...exactMatches, ...fuzzyMatches];
        const uniqueResults = Array.from(new Map(combinedResults.map(movie => [movie.id, movie])).values());

        // Add more debugging
        console.log('Final results before sorting:', uniqueResults);

        return uniqueResults
            .sort((a: any, b: any) => {
                const scoreA = (a.popularity * 0.6) + (Math.log(a.vote_count) * 0.4);
                const scoreB = (b.popularity * 0.6) + (Math.log(b.vote_count) * 0.4);
                return scoreB - scoreA;
            })
            .slice(0, 15) // Increased from 10 to show more results
            .map((movie: any) => ({
                id: movie.id,
                title: movie.title,
                release_date: movie.release_date,
                poster_path: movie.poster_path,
                vote_count: movie.vote_count,
                popularity: movie.popularity
            }));

    } catch (error) {
        console.error('Search movies error:', error);
        return [];
    }
};

// In the getMovieDetails function, ensure we're returning all required properties
export const getMovieDetails = async (movieId: number): Promise<Movie> => {
    try {
        const response = await api.get(`/movie/${movieId}`, {
            params: {
                append_to_response: 'credits'
            }
        });
        
        const movieData = response.data;
        if (!movieData.credits) {
            throw new Error('No credits data found');
        }

        // Transform the data to match the Movie interface
        const movie: Movie = {
            id: movieData.id,
            title: movieData.title,
            release_date: movieData.release_date,
            poster_path: movieData.poster_path,
            budget: movieData.budget,
            revenue: movieData.revenue,
            runtime: movieData.runtime,
            overview: movieData.overview,
            cast: movieData.credits.cast || [],
            crew: movieData.credits.crew || [],
            genres: movieData.genres || [],
            production_companies: movieData.production_companies || [],
            belongs_to_collection: movieData.belongs_to_collection || null,
            tagline: movieData.tagline || ''
        };

        return movie;
    } catch (error) {
        console.error('Error fetching movie details:', error);
        throw error;
    }
};

const validateMovieData = (movie: Movie): boolean => {
    const directors = movie.crew.filter(c => c.job === 'Director');
    console.log(`Directors for ${movie.title}:`, directors);

    return (
        Array.isArray(movie.cast) &&
        Array.isArray(movie.crew) &&
        Array.isArray(movie.genres) &&
        Array.isArray(movie.production_companies) &&
        typeof movie.title === 'string' &&
        typeof movie.release_date === 'string'
    );
};

// Use getMoviePool instead of fetchMoviePool
export const getRandomMovie = async (): Promise<Movie> => {
    try {
        const moviePool = await getMoviePool();
        const randomMovie = moviePool[Math.floor(Math.random() * moviePool.length)];
        const movieWithDetails = await getMovieDetails(randomMovie.id);
        
        if (!validateMovieData(movieWithDetails)) {
            throw new Error('Invalid movie data received');
        }

        return movieWithDetails;
    } catch (error) {
        console.error('Error getting random movie:', error);
        throw error;
    }
};

// Keep track of previously used movie IDs to avoid repeats
const usedMovieIds = new Set<number>();

// Helper function to search our curated list with Fuse.js for better matching
export async function searchCuratedMovies(query: string): Promise<MovieBasic[]> {
    if (query.length < 2) return [];

    try {
        // Create Fuse instance for fuzzy searching
        const fuseOptions = {
            includeScore: true,
            threshold: 0.4,    // Lower threshold for stricter matching
            distance: 100,
            minMatchCharLength: 2,
            shouldSort: true,
            findAllMatches: true,
            ignoreLocation: true,
        };

        const fuse = new Fuse(movieList, fuseOptions);
        const searchResults = fuse.search(query);

        // Get the top 10 matches
        const matchedTitles = searchResults
            .slice(0, 10)
            .map(result => result.item);

        // For each matching title, search TMDB and get the movie details
        const moviePromises = matchedTitles.map(async (title) => {
            try {
                const response = await api.get('/search/movie', {
                    params: {
                        query: title,
                        include_adult: false,
                    }
                });

                // Find the best match from TMDB results
                const tmdbResults = response.data.results;
                const exactMatch = tmdbResults.find((movie: { title: string }) => 
                    movie.title.toLowerCase() === title.toLowerCase()
                );

                // Use exact match if found, otherwise use the first result
                const bestMatch = exactMatch || tmdbResults[0];

                if (bestMatch) {
                    return {
                        id: bestMatch.id,
                        title: bestMatch.title,
                        release_date: bestMatch.release_date,
                        poster_path: bestMatch.poster_path
                    };
                }
                return null;
            } catch (error) {
                console.error(`Error searching for movie "${title}":`, error);
                return null;    
            }
        });

        // Wait for all promises to resolve and filter out any null results
        const movies = await Promise.all(moviePromises);
        return movies.filter((movie: MovieBasic | null): movie is MovieBasic => movie !== null);

    } catch (error) {
        console.error('Search failed:', error);
        return [];
    }
}

// Update getRandomPopularMovie to use our curated list
export async function getRandomPopularMovie(): Promise<Movie | null> {
    const randomIndex = Math.floor(Math.random() * movieList.length);
    const randomTitle = movieList[randomIndex];
    const movie = await findMovieByTitle(randomTitle);
    if (!movie) return null;
    return await getMovieDetails(movie.id);
}

// Update getDailyMovie to use our curated list
export async function getDailyMovie(): Promise<Movie | null> {
    const today = new Date();
    const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const seed = getDailySeed(dateString);
    const index = seed % movieList.length;
    const title = movieList[index];
    
    const movie = await findMovieByTitle(title);
    if (!movie) return null;
    return await getMovieDetails(movie.id);
}

// Add a function to reset the game state
export const resetGameState = () => {
    usedMovieIds.clear();
};

// Update MovieGuessResult interface to include runtime
export interface MovieGuessResult {
    isCorrect: boolean;
    guessedMovie: Movie;
    commonCast: Cast[];
    commonCrew: Crew[];
    commonGenres: Genre[];
    commonProductionCompanies: ProductionCompany[];
    sameCollection: boolean;
    releaseYear: {
        match: boolean;
        difference: number;
        hint: string;
    };
    budget: {
        match: boolean;
        difference: number;
        hint: string;
    };
    revenue: {
        match: boolean;
        difference: number;
        hint: string;
    };
    runtime: {
        match: boolean;
        difference: number;
        hint: string;
    };
}

export const compareMovies = (targetMovie: Movie, guessedMovie: Movie): MovieGuessResult => {
    const commonalities: MovieGuessResult = {
        isCorrect: targetMovie.id === guessedMovie.id,
        guessedMovie,
        
        commonCast: targetMovie.cast.filter(targetCastMember =>
            guessedMovie.cast.some(guessCastMember => guessCastMember.id === targetCastMember.id)
        ),
        
        commonCrew: targetMovie.crew.filter(targetCrewMember =>
            guessedMovie.crew.some(guessCrewMember => 
                guessCrewMember.id === targetCrewMember.id && guessCrewMember.job === targetCrewMember.job
            )
        ),

        commonGenres: targetMovie.genres.filter(targetGenre =>
            guessedMovie.genres.some(guessGenre => guessGenre.id === targetGenre.id)
        ),

        commonProductionCompanies: targetMovie.production_companies.filter(targetCompany =>
            guessedMovie.production_companies.some(guessCompany => guessCompany.id === targetCompany.id)
        ),

        sameCollection: targetMovie.belongs_to_collection?.id === guessedMovie.belongs_to_collection?.id,

        releaseYear: {
            match: false,
            difference: 0,
            hint: ''
        },
        budget: {
            match: false,
            difference: 0,
            hint: ''
        },
        revenue: {
            match: false,
            difference: 0,
            hint: ''
        },
        runtime: {
            match: false,
            difference: 0,
            hint: ''
        }
    };

    // Update numeric comparisons
    if (targetMovie.runtime && guessedMovie.runtime) {
        const diff = targetMovie.runtime - guessedMovie.runtime;
        commonalities.runtime = {
            match: Math.abs(diff) <= 5,
            difference: diff,
            hint: diff > 0 ? 'longer' : 'shorter'
        };
    }

    // Release year comparison
    if (targetMovie.release_date && guessedMovie.release_date) {
        const targetYear = new Date(targetMovie.release_date).getFullYear();
        const guessYear = new Date(guessedMovie.release_date).getFullYear();
        const diff = targetYear - guessYear;
        commonalities.releaseYear = {
            match: diff === 0,
            difference: diff,
            hint: diff > 0 ? 'newer' : 'older'
        };
    }

    // UPDATED Budget comparison - make it more robust
    const targetBudget = targetMovie.budget || 0;
    const guessBudget = guessedMovie.budget || 0;
    
    // Only provide hint if at least one budget is non-zero
    if (targetBudget > 0 || guessBudget > 0) {
        let hint = '';
        if (targetBudget === 0 && guessBudget > 0) {
            hint = 'no budget information available';
        } else if (targetBudget > 0 && guessBudget === 0) {
            hint = 'budget information (your guess has none)';
        } else {
            // Calculate percentage difference to make comparison more meaningful
            const percentDiff = ((targetBudget - guessBudget) / Math.max(targetBudget, guessBudget)) * 100;
            if (Math.abs(percentDiff) < 20) {
                hint = 'similar budget';
            } else {
                hint = percentDiff > 0 ? 'higher budget' : 'lower budget';
            }
        }
        
        commonalities.budget = {
            match: targetBudget === guessBudget,
            difference: targetBudget - guessBudget,
            hint: hint
        };
    }

    // UPDATED Revenue comparison - make it more robust
    const targetRevenue = targetMovie.revenue || 0;
    const guessRevenue = guessedMovie.revenue || 0;
    
    // Only provide hint if at least one revenue is non-zero
    if (targetRevenue > 0 || guessRevenue > 0) {
        let hint = '';
        if (targetRevenue === 0 && guessRevenue > 0) {
            hint = 'no box office information available';
        } else if (targetRevenue > 0 && guessRevenue === 0) {
            hint = 'box office data (your guess has none)';
        } else {
            // Calculate percentage difference for better comparison
            const percentDiff = ((targetRevenue - guessRevenue) / Math.max(targetRevenue, guessRevenue)) * 100;
            if (Math.abs(percentDiff) < 20) {
                hint = 'similar box office performance';
            } else {
                hint = percentDiff > 0 ? 'more successful at the box office' : 'less successful at the box office';
            }
        }
        
        commonalities.revenue = {
            match: targetRevenue === guessRevenue,
            difference: targetRevenue - guessRevenue,
            hint: hint
        };
    }

    return commonalities;
};

// Add function to clear the cache (useful for development/testing)
export const clearMoviePoolCache = () => {
    moviePoolCache = [];
};

// Update the getDailySeed function to generate a consistent seed from the current date
export function getDailySeed(dateString: string): number {
    let hash = 0;
    for (let i = 0; i < dateString.length; i++) {
        const char = dateString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
        hash+=20;
    }
    return Math.abs(hash);
}

// Updated to use the API token instead of API key
// async function fetchPopularMovies(): Promise<MovieBasic[]> {
//     const API_BASE_URL = 'https://api.themoviedb.org/3';
//     const API_TOKEN = import.meta.env.VITE_TMDB_ACCESS_TOKEN;
    
//     // Use the same strict parameters we use for practice games
//     const params = new URLSearchParams({
//         'sort_by': 'popularity.desc',
//         'vote_count.gte': '5000',
//         'vote_average.gte': '6.5',
//         'with_original_language': 'en',
//         'page': '1',
//         'primary_release_date.gte': '1990-01-01',
//         'primary_release_date.lte': `${new Date().getFullYear()}-12-31`,
//     });
    
//     const response = await fetch(
//         `${API_BASE_URL}/discover/movie?${params.toString()}`,
//         {
//             headers: {
//                 'Authorization': `Bearer ${API_TOKEN}`,
//                 'Content-Type': 'application/json'
//             }
//         }
//     );
    
//     if (!response.ok) {
//         throw new Error(`Failed to fetch popular movies: ${response.status}`);
//     }
    
//     const data = await response.json();
//     return data.results;
// }

async function findMovieByTitle(title: string): Promise<MovieBasic | null> {
    const response = await api.get('/search/movie', {
        params: {
            query: title,
            include_adult: false,
            'vote_count.gte': 100,
            'sort_by': 'popularity.desc',
            'page': 1,
            'per_page': 1
        }
    });

    if (response.data.results.length > 0) {
        const movie = response.data.results[0] as MovieBasic;
        return movie;
    }
    return null;
} 