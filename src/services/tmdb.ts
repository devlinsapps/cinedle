import axios from 'axios';
import { Movie, Genre, ProductionCompany, Cast, Crew, MovieBasic } from '../config/tmdb';
import Fuse from 'fuse.js';

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
                'vote_count.gte': 100,
                'sort_by': 'popularity.desc',
                'page': 1,
                'per_page': 40  // Increased to get more potential matches
            }
        });

        const validResults = response.data.results.filter((movie: { 
            id: number;
            title: string;
            vote_count: number; 
            popularity: number;
            original_title?: string;
        }) => 
            movie.vote_count >= 100 && 
            movie.popularity > 5
        );

        // Enhanced Fuse.js options for better spelling tolerance
        const fuseOptions = {
            includeScore: true,
            threshold: 0.6,    // Higher threshold for more lenient matching
            distance: 100,     // Allow for more character differences
            minMatchCharLength: 2,
            keys: [
                { 
                    name: 'title', 
                    weight: 2 
                },
                { 
                    name: 'original_title', 
                    weight: 1 
                }
            ],
            // Add advanced fuzzy matching options
            shouldSort: true,
            location: 0,
            findAllMatches: true,
            ignoreLocation: true,  // Search entire string
            isCaseSensitive: false,
            tokenize: true,        // Match individual words
            matchAllTokens: false, // Allow partial word matches
        };

        const fuse = new Fuse(validResults, fuseOptions);
        // Get both exact and fuzzy matches
        const exactMatches = validResults.filter((movie: { 
            title: string;
            original_title?: string;
        }) => {
            const movieTitle = movie.title.toLowerCase();
            const movieOriginalTitle = movie.original_title?.toLowerCase() || '';
            const searchQuery = query.toLowerCase();
            // Split query into words and check if any word matches
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

        // Combine and deduplicate results
        const combinedResults = [...exactMatches, ...fuzzyMatches];
        const uniqueResults = Array.from(new Map(combinedResults.map(movie => [movie.id, movie])).values());

        // Sort results by relevance and popularity
        return uniqueResults
            .sort((a: any, b: any) => {
                // Create a relevance score that combines popularity and match quality
                const scoreA = (a.popularity * 0.6) + (Math.log(a.vote_count) * 0.4);
                const scoreB = (b.popularity * 0.6) + (Math.log(b.vote_count) * 0.4);
                return scoreB - scoreA;
            })
            .slice(0, 10)
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

// Keep the strict parameters for the random target movie
export const getRandomPopularMovie = async (): Promise<Movie> => {
    try {
        console.log('Starting getRandomPopularMovie...');
        const currentYear = new Date().getFullYear();
        const randomYear = Math.floor(Math.random() * (currentYear - 1990 + 1)) + 1990;
        const randomPage = Math.floor(Math.random() * 20) + 1;
        
        console.log(`Fetching movies for year ${randomYear}, page ${randomPage}...`);
        const response = await api.get('/discover/movie', {
            params: {
                ...MOVIE_POOL_PARAMS,
                'primary_release_date.gte': `${randomYear}-01-01`,
                'primary_release_date.lte': `${randomYear}-12-31`,
                'page': randomPage,
            },
        });
        
        console.log('Received initial movie list');
        const availableMovies = response.data.results.filter(
            (movie: any) => !usedMovieIds.has(movie.id)
        );

        if (availableMovies.length === 0) {
            console.log('No available movies, clearing cache and retrying...');
            usedMovieIds.clear();
            return getRandomPopularMovie();
        }

        const randomMovie = availableMovies[Math.floor(Math.random() * availableMovies.length)];
        console.log('Selected random movie:', randomMovie.title);
        usedMovieIds.add(randomMovie.id);

        console.log('Fetching full movie details...');
        const detailsResponse = await api.get(`/movie/${randomMovie.id}`, {
            params: {
                append_to_response: 'credits'
            }
        });

        console.log('Received full movie details');
        const movieData = detailsResponse.data;
        return {
            ...movieData,
            cast: movieData.credits.cast || [],
            crew: movieData.credits.crew || [],
            genres: movieData.genres || [],
            production_companies: movieData.production_companies || [],
            belongs_to_collection: movieData.belongs_to_collection || null,
        };
    } catch (error) {
        console.error('Get random movie error:', error);
        throw error;
    }
};

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

    // Budget comparison
    if (targetMovie.budget && guessedMovie.budget) {
        const diff = targetMovie.budget - guessedMovie.budget;
        const percentDiff = Math.abs(diff / targetMovie.budget * 100);
        commonalities.budget = {
            match: percentDiff <= 10, // Consider it a match if within 10%
            difference: diff,
            hint: diff > 0 ? 'higher budget' : 'lower budget'
        };
    }

    // Revenue comparison
    if (targetMovie.revenue && guessedMovie.revenue) {
        const diff = targetMovie.revenue - guessedMovie.revenue;
        const percentDiff = Math.abs(diff / targetMovie.revenue * 100);
        commonalities.revenue = {
            match: percentDiff <= 10, // Consider it a match if within 10%
            difference: diff,
            hint: diff > 0 ? 'more successful' : 'less successful'
        };
    }

    return commonalities;
};

// Add function to clear the cache (useful for development/testing)
export const clearMoviePoolCache = () => {
    moviePoolCache = [];
};

// Update the getDailySeed function to generate a consistent seed from the current date
export function getDailySeed(): number {
    const today = new Date();
    const dateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // Simple hash function to convert date string to a number
    let hash = 0;
    for (let i = 0; i < dateString.length; i++) {
        const char = dateString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
        hash+=1;
    }
    return Math.abs(hash);
}

// Update the getDailyMovie function to use the seed to select a movie
export async function getDailyMovie(): Promise<Movie> {
    // Get a seed based on today's date
    const seed = getDailySeed();
    console.log(`Generating daily movie with seed: ${seed}`);
    
    // Use your existing API to get a list of popular movies
    const popularMovies = await fetchPopularMovies();
    
    // Use the seed to select a specific movie from the list
    const index = seed % popularMovies.length;
    const selectedMovie = popularMovies[index];
    
    // Get the full details of the selected movie
    const movie = await getMovieDetails(selectedMovie.id);
    
    return movie;
}

// Updated to use the API token instead of API key
async function fetchPopularMovies(): Promise<MovieBasic[]> {
    const API_BASE_URL = 'https://api.themoviedb.org/3';
    const API_TOKEN = import.meta.env.VITE_TMDB_ACCESS_TOKEN;
    
    const response = await fetch(
        `${API_BASE_URL}/movie/popular?language=en-US&page=1`,
        {
            headers: {
                'Authorization': `Bearer ${API_TOKEN}`,
                'Content-Type': 'application/json'
            }
        }
    );
    
    if (!response.ok) {
        throw new Error(`Failed to fetch popular movies: ${response.status}`);
    }
    
    const data = await response.json();
    return data.results;
} 