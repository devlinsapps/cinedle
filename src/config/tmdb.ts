export const BASE_URL = 'https://api.themoviedb.org/3';

export const TMDB_CONFIG = {
    IMAGE_BASE_URL: 'https://image.tmdb.org/t/p',
    POSTER_SIZE: 'w342',
    PROFILE_SIZE: 'w185',
};

export interface Genre {
    id: number;
    name: string;
}

export interface ProductionCompany {
    id: number;
    name: string;
    logo_path: string | null;
    origin_country: string;
}

export interface Cast {
    id: number;
    name: string;
    character: string;
    profile_path: string | null;
}

export interface Crew {
    id: number;
    name: string;
    job: string;
    department: string;
}

export interface Collection {
    id: number;
    name: string;
}

export interface Movie {
    id: number;
    title: string;
    release_date: string;
    poster_path: string | null;
    budget: number;
    revenue: number;
    runtime: number | null;
    overview: string;
    cast: Cast[];
    crew: Crew[];
    genres: Genre[];
    production_companies: ProductionCompany[];
    belongs_to_collection: Collection | null;
    tagline: string;
}

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

export interface SpokenLanguage {
    iso_639_1: string;
    name: string;
}

export interface ProductionCountry {
    iso_3166_1: string;
    name: string;
}

// Add this interface for partial movie data
export interface MovieBasic {
    id: number;
    title: string;
    release_date: string;
    poster_path: string | null;
    vote_count?: number;
    popularity?: number;
} 