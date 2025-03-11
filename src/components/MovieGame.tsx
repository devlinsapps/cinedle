import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    TextField,
    Autocomplete,
    Typography,
    Paper,
    Chip,
    CircularProgress,
    Button,
    Collapse,
} from '@mui/material';
import type { Movie, MovieGuessResult, MovieBasic } from '../config/tmdb';
import { searchMovies, getMovieDetails, getRandomPopularMovie, compareMovies, getDailyMovie } from '../services/tmdb';
import { debounce } from '@mui/material/utils';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';


interface DiscoveredInfo {
    cast: Set<number>;
    crew: Set<number>;
    genres: Set<number>;
    productionCompanies: Set<number>;
    year: boolean;
    runtime: boolean;
    collection: boolean;
}

const TMDB_URLS = {
    PERSON: 'https://www.themoviedb.org/person',
    MOVIE: 'https://www.themoviedb.org/movie',
    GENRE: 'https://www.themoviedb.org/genre'
};

const STORAGE_KEY = 'cinedle_daily_game';
const STORAGE_DATE_KEY = 'cinedle_last_played_date';
const PRACTICE_STORAGE_KEY = 'cinedle_practice_game';
const APP_VERSION = '1.0.3'; // Increment this whenever you want to force a refresh
const VERSION_KEY = 'cinedle_version';

interface GameOverScreenProps {
    won: boolean;
    targetMovie: Movie;
    guesses: MovieGuessResult[];
    onNewGame: () => void;
    onShare: () => void;
    showShareMessage: boolean;
    hintUsed: boolean;
}

export const MovieGame: React.FC = () => {
    const [targetMovie, setTargetMovie] = useState<Movie | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<MovieBasic[]>([]);
    const [guesses, setGuesses] = useState<MovieGuessResult[]>([]);
    const [won, setWon] = useState(false);
    const [loading, setLoading] = useState(false);
    const [isInitializing, setIsInitializing] = useState(true);
    const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
    const [hasGivenUp, setHasGivenUp] = useState(false);
    const [showShareMessage, setShowShareMessage] = useState(false);
    const [hintUsed, setHintUsed] = useState(false);
    const [dailyMovieCompleted, setDailyMovieCompleted] = useState(false);
    const [dailyMovie, setDailyMovie] = useState<Movie | null>(null);
    const [isPlayingDaily, setIsPlayingDaily] = useState(true);
    const [showDailyGameOver, setShowDailyGameOver] = useState(false);
    const [practiceMovie, setPracticeMovie] = useState<Movie | null>(null);
    const [practiceGuesses, setPracticeGuesses] = useState<MovieGuessResult[]>([]);
    const [practiceWon, setPracticeWon] = useState(false);
    const [practiceGaveUp, setPracticeGaveUp] = useState(false);
    const [practiceHintUsed, setPracticeHintUsed] = useState(false);
    const [showDailyGameEndScreen, setShowDailyGameEndScreen] = useState(false);
    const initRef = React.useRef(false);

    useEffect(() => {
        // Check if we need to force a refresh
        const savedVersion = localStorage.getItem(VERSION_KEY);
        if (savedVersion !== APP_VERSION) {
            console.log(`Version changed from ${savedVersion} to ${APP_VERSION}. Clearing data...`);
            
            // Clear all game data
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(STORAGE_DATE_KEY);
            localStorage.removeItem(PRACTICE_STORAGE_KEY);
            
            // Save the new version
            localStorage.setItem(VERSION_KEY, APP_VERSION);
            
            // Force reload the page to ensure a clean state
            window.location.reload();
            return;
        }
        
        // Continue with normal initialization...
    }, []);

    const initializeGame = async () => {
        console.log('Init state:', { isInitializing, initRef: initRef.current });
        
        if (initRef.current) {
            console.log('Already initialized, skipping');
            return;
        }
        
        setIsInitializing(true);
        
        try {
            // Check if we have a saved daily game first
            const lastPlayedDate = localStorage.getItem(STORAGE_DATE_KEY);
            const todayString = new Date().toDateString();
            const savedState = localStorage.getItem(STORAGE_KEY);
            
            if (lastPlayedDate === todayString && savedState) {
                try {
                    const { targetMovie: savedTarget, guesses: savedGuesses, won: savedWon, gaveUp: savedGaveUp, hintUsed: savedHintUsed } = JSON.parse(savedState);
                    
                    if (savedTarget) {
                        console.log('Loading saved daily game');
                        setTargetMovie(savedTarget);
                        setDailyMovie(savedTarget);
                        setGuesses(savedGuesses || []);
                        setWon(savedWon || false);
                        setHasGivenUp(savedGaveUp || false);
                        setHintUsed(savedHintUsed || false);
                        setDailyMovieCompleted(savedWon || savedGaveUp || false);
                        setIsPlayingDaily(true);
                        initRef.current = true;
                        setIsInitializing(false);
                        return;
                    }
                } catch (error) {
                    console.error("Error parsing saved game state:", error);
                }
            }
            
            // If no saved game or it's a new day, get a new daily movie
            console.log('Starting game initialization...');
            const movie = await getDailyMovie();
            console.log('Received movie:', movie);
            setTargetMovie(movie);
            setDailyMovie(movie);
            setGuesses([]);
            setWon(false);
            setHasGivenUp(false);
            setHintUsed(false);
            setDailyMovieCompleted(false);
            setIsPlayingDaily(true);
            localStorage.setItem(STORAGE_DATE_KEY, todayString);
            initRef.current = true;
        } catch (err) {
            console.error('Failed to initialize game:', err);
            initRef.current = false; // Reset on error
        } finally {
            setIsInitializing(false);
        }
    };

    useEffect(() => {
        if (!initRef.current) {
            initializeGame();
        }
    }, []);

    const debouncedSearch = React.useMemo(
        () => debounce(async (query: string) => {
            if (query.length >= 2) {
                setLoading(true);
                try {
                    const results = await searchMovies(query);
                    setSearchResults(results);
                } catch (error) {
                    console.error('Search failed:', error);
                } finally {
                    setLoading(false);
                }
            } else {
                setSearchResults([]);
            }
        }, 300),
        []
    );

    React.useEffect(() => {
        return () => {
            debouncedSearch.clear();
        };
    }, [debouncedSearch]);

    const handleSubmitGuess = async () => {
        if (!selectedMovie || !targetMovie) return;

        setLoading(true);
        try {
            const fullMovieDetails = await getMovieDetails(selectedMovie.id);
            const result = compareMovies(targetMovie, fullMovieDetails);
            
            if (isPlayingDaily) {
                // Update daily game state
                setGuesses(prev => [...prev, result] as MovieGuessResult[]);
                if (result.isCorrect) {
                    setWon(true);
                }
            } else {
                // Update practice game state
                setPracticeGuesses(prev => [...prev, result] as MovieGuessResult[]);
                if (result.isCorrect) {
                    setPracticeWon(true);
                }
            }
        } catch (error) {
            console.error('Failed to process guess:', error);
        } finally {
            setLoading(false);
            setSearchQuery('');
            setSelectedMovie(null);
        }
    };

    const handleNewGame = useCallback(async () => {
        // Close any open dialogs
        setShowDailyGameOver(false);
        
        // If transitioning from daily to practice after winning/giving up
        if (showDailyGameEndScreen) {
            setShowDailyGameEndScreen(false); // Hide the daily game end screen
            setIsPlayingDaily(false); // Now switch to practice mode
        }
        
        // Reset practice game state
        setPracticeWon(false);
        setPracticeGaveUp(false);
        setPracticeHintUsed(false);
        
        setLoading(true);
        try {
            // Start a random practice game
            const movie = await getRandomPopularMovie();
            setTargetMovie(movie);
            setPracticeMovie(movie);
            setPracticeGuesses([]);
            setShowShareMessage(false);
        } catch (err) {
            console.error('Failed to fetch movie:', err);
        } finally {
            setLoading(false);
        }
    }, [showDailyGameEndScreen]);

    useEffect(() => {
        const lastPlayedDate = localStorage.getItem(STORAGE_DATE_KEY);
        const todayString = new Date().toDateString();
        
        if (lastPlayedDate !== todayString) {
            // It's a new day, start a new daily game
            localStorage.removeItem(PRACTICE_STORAGE_KEY);
            initializeGame();
            localStorage.setItem(STORAGE_DATE_KEY, todayString);
        } else {
            // Same day, load saved games
            const savedDailyState = localStorage.getItem(STORAGE_KEY);
            
            if (savedDailyState) {
                try {
                    const { targetMovie: savedTarget, guesses: savedGuesses, won: savedWon, gaveUp: savedGaveUp, hintUsed: savedHintUsed } = JSON.parse(savedDailyState);
                    
                    // Always load the daily game state
                    setDailyMovie(savedTarget);
                    setGuesses(savedGuesses || []);
                    setWon(savedWon || false);
                    setHasGivenUp(savedGaveUp || false);
                    setHintUsed(savedHintUsed || false);
                    setDailyMovieCompleted(savedWon || savedGaveUp || false);
                    
                    // Check if daily is completed, then we're in practice mode
                    if (savedWon || savedGaveUp) {
                        const savedPracticeState = localStorage.getItem(PRACTICE_STORAGE_KEY);
                        
                        if (savedPracticeState) {
                            // Load practice game if it exists
                            const { targetMovie: practiceTarget, guesses: practiceGuesses, won: practiceWon, gaveUp: practiceGaveUp, hintUsed: practiceHintUsed } = JSON.parse(savedPracticeState);
                            setTargetMovie(practiceTarget);
                            setPracticeMovie(practiceTarget);
                            setPracticeGuesses(practiceGuesses || []);
                            setPracticeWon(practiceWon || false);
                            setPracticeGaveUp(practiceGaveUp || false);
                            setPracticeHintUsed(practiceHintUsed || false);
                            setIsPlayingDaily(false);
                        } else {
                            // No practice game yet, start with daily movie displayed
                            setTargetMovie(savedTarget);
                            setIsPlayingDaily(false); // Still in practice mode but showing daily movie
                        }
                    } else {
                        // Daily game not completed yet
                        setTargetMovie(savedTarget);
                        setIsPlayingDaily(true);
                    }
                    
                    initRef.current = true;
                } catch (error) {
                    console.error("Error parsing saved game state:", error);
                    initializeGame();
                }
            } else {
                initializeGame();
            }
        }
    }, []);

    useEffect(() => {
        // Always save daily game state
        if (dailyMovie) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                targetMovie: dailyMovie,
                guesses,
                won,
                gaveUp: hasGivenUp,
                hintUsed
            }));
        }
        
        // Only save practice game state when we have a practice game and daily is completed
        if (dailyMovieCompleted && practiceMovie && !isPlayingDaily) {
            localStorage.setItem(PRACTICE_STORAGE_KEY, JSON.stringify({
                targetMovie: practiceMovie,
                guesses: practiceGuesses,
                won: practiceWon,
                gaveUp: practiceGaveUp,
                hintUsed: practiceHintUsed
            }));
        }
    }, [
        dailyMovie, guesses, won, hasGivenUp, hintUsed,
        practiceMovie, practiceGuesses, practiceWon, practiceGaveUp, practiceHintUsed, 
        dailyMovieCompleted, isPlayingDaily
    ]);

    useEffect(() => {
        if (isPlayingDaily && (won || hasGivenUp)) {
            setDailyMovieCompleted(true);
            setShowDailyGameEndScreen(true); // Show game over screen instead of immediately switching to practice mode
        }
    }, [won, hasGivenUp, isPlayingDaily]);

    const handleGiveUp = () => {
        if (isPlayingDaily) {
            setHasGivenUp(true);
        } else {
            setPracticeGaveUp(true);
        }
    };

    const handleGetHint = () => {
        if (!targetMovie) return;
        
        if (isPlayingDaily) {
            if (!hintUsed) {
                setHintUsed(true);
            }
        } else {
            if (!practiceHintUsed) {
                setPracticeHintUsed(true);
            }
        }
    };

    const generateShareText = () => {
        const guessCount = guesses.length;
        const hintIndicator = hintUsed ? ' (with hint 💡)' : '';
        
        return `I ${won ? 'got' : 'failed'} the Cinedle in ${guessCount} guesses${hintIndicator}!

Play at: https://cinedle.ca`;
    };

    const handleShare = async () => {
        try {
            const shareText = generateShareText();
            await navigator.clipboard.writeText(shareText);
            setShowShareMessage(true);
            setTimeout(() => setShowShareMessage(false), 2000);
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
        }
    };

    const getDiscoveredInfo = () => {
        const currentGuesses = isPlayingDaily ? guesses : practiceGuesses;
        if (currentGuesses.length === 0) return null;

        const discovered = {
            cast: new Set<number>(),
            crew: new Set<number>(),
            genres: new Set<number>(),
            productionCompanies: new Set<number>(),
            year: false,
            runtime: false,
            collection: false,
        };

        currentGuesses.forEach(guess => {
            guess.commonCast.forEach(cast => discovered.cast.add(cast.id));
            guess.commonCrew.forEach(crew => discovered.crew.add(crew.id));
            guess.commonGenres.forEach(genre => discovered.genres.add(genre.id));
            guess.commonProductionCompanies.forEach(company => discovered.productionCompanies.add(company.id));
            
            if (guess.releaseYear.match) discovered.year = true;
            if (guess.sameCollection) discovered.collection = true;
        });

        return discovered;
    };

    const GuessHistory = () => {
        const currentGuesses = isPlayingDaily ? guesses : practiceGuesses;
        
        return (
            <Paper 
                elevation={0}
                sx={{ 
                    p: 3,
                    borderRadius: 2,
                    backgroundColor: 'background.paper'
                }}
            >
                <Typography 
                    variant="h6" 
                    gutterBottom
                    sx={{ 
                        borderBottom: 1, 
                        borderColor: 'divider',
                        pb: 1
                    }}
                >
                    Previous Guesses ({currentGuesses.length})
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {currentGuesses.slice().reverse().map((guess, index) => (
                        <Paper
                            key={index}
                            sx={{ 
                                p: 2,
                                backgroundColor: guess.isCorrect ? 'success.dark' : 'background.default',
                                borderRadius: 1,
                                transition: 'all 0.2s ease-in-out',
                                '&:hover': {
                                    transform: 'translateY(-2px)',
                                    boxShadow: 3
                                }
                            }}
                        >
                            <Box sx={{ display: 'flex', gap: 2 }}>
                                {/* Movie Poster */}
                                {guess.guessedMovie.poster_path && (
                                    <Box 
                                        sx={{ 
                                            flexShrink: 0,
                                            width: 60,
                                            height: 90,
                                        }}
                                    >
                                        <img
                                            src={`https://image.tmdb.org/t/p/w92${guess.guessedMovie.poster_path}`}
                                            alt={guess.guessedMovie.title}
                                            style={{
                                                width: '100%',
                                                height: '100%',
                                                objectFit: 'cover',
                                                borderRadius: '4px',
                                            }}
                                        />
                                    </Box>
                                )}
                                
                                {/* Movie Info */}
                                <Box sx={{ flex: 1 }}>
                                    <Typography 
                                        variant="subtitle1" 
                                        sx={{ 
                                            fontWeight: 'medium',
                                            mb: 1
                                        }}
                                    >
                                        {guess.guessedMovie.title}
                                    </Typography>
                                    
                                    {!guess.isCorrect && (
                                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                                            {/* Common Elements Section */}
                                            {/* Cast */}
                                            {guess.commonCast.length > 0 && (
                                                <Box>
                                                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                                                        Common Cast:
                                                    </Typography>
                                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                        {guess.commonCast.map(cast => (
                                                            <Chip
                                                                key={cast.id}
                                                                label={cast.name}
                                                                size="small"
                                                                variant="outlined"
                                                                onClick={() => window.open(`${TMDB_URLS.PERSON}/${cast.id}`, '_blank')}
                                                                sx={{ 
                                                                    cursor: 'pointer',
                                                                    '&:hover': {
                                                                        backgroundColor: 'action.hover'
                                                                    }
                                                                }}
                                                            />
                                                        ))}
                                                    </Box>
                                                </Box>
                                            )}

                                            {/* Crew */}
                                            {guess.commonCrew.length > 0 && (
                                                <Box>
                                                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                                                        Common Crew:
                                                    </Typography>
                                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                        {guess.commonCrew.map(crew => (
                                                            <Chip
                                                                key={`${crew.id}-${crew.job}`}
                                                                label={`${crew.name} (${crew.job})`}
                                                                size="small"
                                                                variant="outlined"
                                                                onClick={() => window.open(`${TMDB_URLS.PERSON}/${crew.id}`, '_blank')}
                                                                sx={{ 
                                                                    cursor: 'pointer',
                                                                    flexGrow: 0,
                                                                    '&:hover': {
                                                                        backgroundColor: 'action.hover'
                                                                    }
                                                                }}
                                                            />
                                                        ))}
                                                    </Box>
                                                </Box>
                                            )}

                                            {/* Genres */}
                                            {guess.commonGenres.length > 0 && (
                                                <Box>
                                                    <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5 }}>
                                                        Common Genres:
                                                    </Typography>
                                                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                        {guess.commonGenres.map(genre => (
                                                            <Chip
                                                                key={genre.id}
                                                                label={genre.name}
                                                                size="small"
                                                                variant="outlined"
                                                                onClick={() => window.open(`${TMDB_URLS.GENRE}/${genre.id}`, '_blank')}
                                                                sx={{ 
                                                                    cursor: 'pointer',
                                                                    '&:hover': {
                                                                        backgroundColor: 'action.hover'
                                                                    }
                                                                }}
                                                            />
                                                        ))}
                                                    </Box>
                                                </Box>
                                            )}

                                            {/* Hints in original text format */}
                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                                {/* Release Year Hint */}
                                                {guess.releaseYear.difference !== 0 && (
                                                    <Typography variant="body2" color="text.secondary">
                                                        Target movie is {Math.abs(guess.releaseYear.difference)} year(s) {guess.releaseYear.hint}
                                                    </Typography>
                                                )}
                                                
                                                {/* Budget Hint */}
                                                {guess.budget.difference !== 0 && (
                                                    <Typography variant="body2" color="text.secondary">
                                                        Target movie has a {guess.budget.hint}
                                                    </Typography>
                                                )}
                                                
                                                {/* Revenue Hint */}
                                                {guess.revenue.difference !== 0 && (
                                                    <Typography variant="body2" color="text.secondary">
                                                        Target movie was {guess.revenue.hint}
                                                    </Typography>
                                                )}
                                            </Box>
                                        </Box>
                                    )}
                                </Box>
                            </Box>
                        </Paper>
                    ))}
                </Box>
            </Paper>
        );
    };

    const ContextPanel = ({ targetMovie, discovered }: { targetMovie: Movie, discovered: DiscoveredInfo | null }) => {
        const [showAllCrew, setShowAllCrew] = useState(false);

        if (!discovered) return null;

        const discoveredCrew = targetMovie.crew.filter(person => discovered.crew.has(person.id));
        
        // Define important roles
        const importantRoles = ['Director', 'Producer', 'Director of Photography', 'Original Music Composer'];
        
        // Check if any important role has been discovered
        const hasImportantRole = discoveredCrew.some(c => importantRoles.includes(c.job));
        
        // Split crew based on importance
        const importantCrew = discoveredCrew.filter(c => importantRoles.includes(c.job));
        const otherCrew = discoveredCrew.filter(c => !importantRoles.includes(c.job));

        return (
            <Paper sx={{ p: 2, height: '100%' }}>
                <Typography variant="h6" gutterBottom>
                    Discovered Information
                </Typography>
                
                {/* Cast Section */}
                {discovered.cast.size > 0 && (
                    <Box>
                        <Typography variant="subtitle1" color="primary" gutterBottom>
                            Cast
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {targetMovie.cast
                                .filter(person => discovered.cast.has(person.id))
                                .map(person => (
                                    <Chip 
                                        key={person.id}
                                        size="small"
                                        label={person.name}
                                        onClick={() => window.open(`${TMDB_URLS.PERSON}/${person.id}`, '_blank')}
                                        sx={{ 
                                            cursor: 'pointer',
                                            '&:hover': {
                                                backgroundColor: 'action.hover'
                                            }
                                        }}
                                    />
                                ))}
                        </Box>
                    </Box>
                )}
                
                {/* Updated Crew Section */}
                {discovered.crew.size > 0 && (
                    <Box>
                        <Typography variant="subtitle1" color="primary" gutterBottom>
                            Crew
                        </Typography>
                        <Box sx={{ 
                            display: 'flex', 
                            flexWrap: 'wrap',
                            gap: 1,
                            width: 'fit-content'
                        }}>
                            {/* Show all crew members if 3 or fewer and no important roles */}
                            {!hasImportantRole && discoveredCrew.length <= 3 ? (
                                discoveredCrew.map(crew => (
                                    <Chip 
                                        key={`${crew.id}-${crew.job}`}
                                        size="small"
                                        label={`${crew.name} (${crew.job})`}
                                        onClick={() => window.open(`${TMDB_URLS.PERSON}/${crew.id}`, '_blank')}
                                        sx={{ 
                                            cursor: 'pointer',
                                            flexGrow: 0,
                                            '&:hover': {
                                                backgroundColor: 'action.hover'
                                            }
                                        }}
                                    />
                                ))
                            ) : (
                                <>
                                    {/* Important crew members */}
                                    {importantCrew.map(crew => (
                                        <Chip 
                                            key={`${crew.id}-${crew.job}`}
                                            size="small"
                                            label={`${crew.name} (${crew.job})`}
                                            onClick={() => window.open(`${TMDB_URLS.PERSON}/${crew.id}`, '_blank')}
                                            sx={{ 
                                                cursor: 'pointer',
                                                flexGrow: 0,
                                                '&:hover': {
                                                    backgroundColor: 'action.hover'
                                                }
                                            }}
                                        />
                                    ))}
                                    
                                    {/* Other crew members in collapse */}
                                    {otherCrew.length > 0 && (
                                        <Box sx={{ width: '100%' }}>
                                            <Button
                                                size="small"
                                                onClick={() => setShowAllCrew(!showAllCrew)}
                                                sx={{ mt: 1 }}
                                            >
                                                {showAllCrew ? 'Show Less' : `And ${otherCrew.length} more...`}
                                            </Button>
                                            <Collapse in={showAllCrew}>
                                                <Box sx={{ 
                                                    display: 'flex', 
                                                    flexWrap: 'wrap', 
                                                    gap: 1, 
                                                    mt: 1,
                                                    width: 'fit-content'
                                                }}>
                                                    {otherCrew.map(crew => (
                                                        <Chip 
                                                            key={`${crew.id}-${crew.job}`}
                                                            size="small"
                                                            label={`${crew.name} (${crew.job})`}
                                                            onClick={() => window.open(`${TMDB_URLS.PERSON}/${crew.id}`, '_blank')}
                                                            sx={{ 
                                                                cursor: 'pointer',
                                                                flexGrow: 0,
                                                                '&:hover': {
                                                                    backgroundColor: 'action.hover'
                                                                }
                                                            }}
                                                        />
                                                    ))}
                                                </Box>
                                            </Collapse>
                                        </Box>
                                    )}
                                </>
                            )}
                        </Box>
                    </Box>
                )}
                
                {/* Genres Section */}
                {discovered.genres.size > 0 && (
                    <Box>
                        <Typography variant="subtitle1" color="primary" gutterBottom>
                            Genres
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {targetMovie.genres
                                .filter(genre => discovered.genres.has(genre.id))
                                .map(genre => (
                                    <Chip 
                                        key={genre.id}
                                        size="small"
                                        label={genre.name}
                                        onClick={() => window.open(`${TMDB_URLS.GENRE}/${genre.id}`, '_blank')}
                                        sx={{ 
                                            cursor: 'pointer',
                                            '&:hover': {
                                                backgroundColor: 'action.hover'
                                            }
                                        }}
                                    />
                                ))}
                        </Box>
                    </Box>
                )}
                
                {/* Other Details Section */}
                {(discovered.year || discovered.collection) && (
                    <Box>
                        <Typography variant="subtitle1" color="primary" gutterBottom>
                            Other Details
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {discovered.year && (
                                <Chip 
                                    size="small"
                                    label={`Release Year: ${targetMovie.release_date.split('-')[0]}`}
                                />
                            )}
                            {discovered.collection && targetMovie.belongs_to_collection && (
                                <Chip 
                                    size="small"
                                    label={`Part of: ${targetMovie.belongs_to_collection.name}`}
                                    onClick={() => targetMovie.belongs_to_collection && window.open(`${TMDB_URLS.MOVIE}/${targetMovie.belongs_to_collection.id}`, '_blank')}
                                    sx={{ 
                                        cursor: 'pointer',
                                        '&:hover': {
                                            backgroundColor: 'action.hover'
                                        }
                                    }}
                                />
                            )}
                        </Box>
                    </Box>
                )}
            </Paper>
        );
    };

    const DailyChallenge = () => {
        // Always show if daily is completed, regardless of current mode
        if (!dailyMovie || !dailyMovieCompleted) return null;
        
        const handleBannerClick = () => {
            setShowDailyGameOver(true);
        };
        
        // Prevent share button click from opening the daily game dialog
        const handleShareClick = (e: React.MouseEvent) => {
            e.stopPropagation();
            handleShare();
        };
        
        // Prepare player stats text
        const guessCount = guesses.length;
        const hintStatus = hintUsed ? " (with hint)" : "";
        const resultText = won ? `Solved in ${guessCount} ${guessCount === 1 ? 'guess' : 'guesses'}${hintStatus}` : "Not solved";
        
        return (
            <Paper 
                elevation={0}
                onClick={handleBannerClick}
                sx={{ 
                    p: 2,
                    mb: 3,
                    borderRadius: 2,
                    backgroundColor: 'background.paper',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    '&:hover': {
                        boxShadow: 2,
                        transform: 'translateY(-2px)'
                    }
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
                    {dailyMovie.poster_path && (
                        <Box 
                            sx={{ 
                                flexShrink: 0,
                                width: 40,
                                height: 60,
                            }}
                        >
                            <img
                                src={`https://image.tmdb.org/t/p/w92${dailyMovie.poster_path}`}
                                alt={dailyMovie.title}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    borderRadius: '4px',
                                }}
                            />
                        </Box>
                    )}
                    
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                            Today's Movie:
                        </Typography>
                        <Typography variant="body1" fontWeight="medium">
                            {dailyMovie.title} ({new Date(dailyMovie.release_date).getFullYear()})
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {resultText}
                    </Typography>
                </Box>
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography 
                            variant="body2" 
                            sx={{ 
                                bgcolor: won ? 'success.main' : 'warning.main', 
                                color: 'white', 
                                px: 1.5, 
                                py: 0.5, 
                                borderRadius: 1,
                                fontWeight: 'medium'
                            }}
                        >
                            {won ? 'Completed' : 'Revealed'}
                        </Typography>
                        
                        <Button 
                            variant="outlined"
                            size="small"
                            color="primary"
                            onClick={handleShareClick}
                            sx={{ 
                                minWidth: 0, 
                                whiteSpace: 'nowrap',
                                borderRadius: 1,
                                py: 0.5,
                                px: 1.5
                            }}
                        >
                            {showShareMessage ? 'Copied!' : 'Share'}
                        </Button>
                    </Box>
                </Box>
            </Paper>
        );
    };

    const GameOverScreen: React.FC<GameOverScreenProps> = ({ 
        won, 
        targetMovie, 
        guesses, 
        onNewGame, 
        onShare,
        showShareMessage,
  
    }) => {
        // Check if this is the daily game end screen
        const isDaily = isPlayingDaily || showDailyGameEndScreen;
        
        return (
            <Dialog open={true} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ textAlign: 'center', pt: 3 }}>
                    {won ? '🎉 You got it!' : '😢 Better luck next time!'}
                </DialogTitle>
                <DialogContent sx={{ px: 3, py: 2 }}>
                    {/* Add movie poster */}
                    {targetMovie.poster_path && (
                        <Box sx={{ 
                            display: 'flex', 
                            justifyContent: 'center', 
                            mb: 2 
                        }}>
                            <Box 
                                component="img"
                                src={`https://image.tmdb.org/t/p/w300${targetMovie.poster_path}`}
                                alt={targetMovie.title}
                                sx={{ 
                                    maxWidth: '200px',
                                    borderRadius: 1,
                                    boxShadow: 3
                                }}
                            />
                        </Box>
                    )}
                    
                    <Box sx={{ mb: 2, textAlign: 'center' }}>
                        <Typography variant="h6" component="p" sx={{ mb: 1 }}>
                            The movie was:
                        </Typography>
                        <Typography variant="h5" component="p" sx={{ fontWeight: 'bold' }}>
                            {targetMovie.title} ({new Date(targetMovie.release_date).getFullYear()})
                        </Typography>
                    </Box>
                    <Typography sx={{ mb: 2, textAlign: 'center' }}>
                        You made {guesses.length} {guesses.length === 1 ? 'guess' : 'guesses'}.
                    </Typography>
                    {isDaily ? (
                        <Typography sx={{ mb: 2, textAlign: 'center', color: 'text.secondary' }}>
                            You've completed today's challenge! You can now play more games for fun.
                        </Typography>
                    ) : (
                        <Typography sx={{ mb: 2, textAlign: 'center', color: 'text.secondary' }}>
                            This was a practice game. Try another one!
                        </Typography>
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2, gap: 1 }}>
                    {isDaily && (
                        <Button 
                            variant="contained" 
                            onClick={onShare}
                            color="primary"
                            sx={{ minWidth: 120 }}
                        >
                            <Box component="span" sx={{ display: 'block', minWidth: '100%' }}>
                                {showShareMessage ? 'Copied!' : 'Share Results'}
                            </Box>
                        </Button>
                    )}
                    <Button 
                        variant="contained" 
                        onClick={onNewGame}
                        color="secondary"
                        fullWidth={!isDaily}
                    >
                        {dailyMovieCompleted ? 'Play Practice Game' : 'New Game'}
                    </Button>
                </DialogActions>
            </Dialog>
        );
    };

    const DailyGameOverScreen: React.FC = () => {
        if (!dailyMovie) return null;
        
        return (
            <Dialog 
                open={showDailyGameOver} 
                onClose={() => setShowDailyGameOver(false)}
                maxWidth="sm" 
                fullWidth
            >
                <DialogTitle sx={{ textAlign: 'center', pt: 3 }}>
                    Today's Challenge
                </DialogTitle>
                <DialogContent sx={{ px: 3, py: 2 }}>
                    {/* Add movie poster */}
                    {dailyMovie.poster_path && (
                        <Box sx={{ 
                            display: 'flex', 
                            justifyContent: 'center', 
                            mb: 2 
                        }}>
                            <Box 
                                component="img"
                                src={`https://image.tmdb.org/t/p/w300${dailyMovie.poster_path}`}
                                alt={dailyMovie.title}
                                sx={{ 
                                    maxWidth: '200px',
                                    borderRadius: 1,
                                    boxShadow: 3
                                }}
                            />
                        </Box>
                    )}
                    
                    <Box sx={{ mb: 2, textAlign: 'center' }}>
                        <Typography variant="h6" component="p" sx={{ mb: 1 }}>
                            The movie was:
                        </Typography>
                        <Typography variant="h5" component="p" sx={{ fontWeight: 'bold' }}>
                            {dailyMovie.title} ({new Date(dailyMovie.release_date).getFullYear()})
                        </Typography>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2, gap: 1 }}>
                    <Button 
                        variant="contained" 
                        onClick={handleShare}
                        color="primary"
                        sx={{ minWidth: 120 }}
                    >
                        <Box component="span" sx={{ display: 'block', minWidth: '100%' }}>
                            {showShareMessage ? 'Copied!' : 'Share Results'}
                        </Box>
                    </Button>
                    <Button 
                        variant="contained" 
                        onClick={() => setShowDailyGameOver(false)}
                        color="secondary"
                    >
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        );
    };

    if (isInitializing) {
        return (
            <Box 
                sx={{ 
                    width: '100vw',
                    height: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    backgroundColor: 'background.default',
                }}
            >
                <Box 
                    sx={{ 
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2
                    }}
                >
                    <CircularProgress size={60} />
                    <Typography variant="h6">
                        Loading game...
                    </Typography>
                </Box>
            </Box>
        );
    }

    return (
        <Box 
            sx={{ 
                minHeight: '100vh',
                width: '100vw',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'background.default',
            }}
        >
            <Box 
                sx={{ 
                    width: '100%',
                    textAlign: 'center', 
                    pt: { xs: 2, sm: 3 },
                    pb: { xs: 3, sm: 4 },
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                }}
            >
                <Typography 
                    variant="h1" 
                    component="h1"
                    sx={{ 
                        fontWeight: 700,
                        color: 'primary.main',
                        letterSpacing: -1,
                        fontSize: { xs: '2.5rem', sm: '3rem' },
                    }}
                >
                    Cinedle
                </Typography>
                <Typography 
                    variant="body1" 
                    sx={{ 
                        maxWidth: '600px',
                        mb: 2,
                        color: 'text.secondary',
                        px: 2
                    }}
                >
                    Guess the movie in as few tries as possible. Each guess reveals matching cast, crew, and other details. New movie every day!
                </Typography>
            </Box>

            <Box 
                sx={{ 
                    flex: 1,
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'center',
                }}
            >
                <Box 
                    sx={{
                        maxWidth: '900px',
                        width: '100%',
                        mx: 'auto',
                        px: { xs: 2, sm: 3 },
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 3,
                    }}
                >
                    <DailyChallenge />
                    
                    {dailyMovieCompleted && !isPlayingDaily && (
                        <Box sx={{ textAlign: 'center', mb: 1 }}>
                            <Typography 
                                variant="subtitle1" 
                                sx={{ 
                                    display: 'inline-block',
                                    bgcolor: 'secondary.main',
                                    color: 'white',
                                    px: 2,
                                    py: 0.5,
                                    borderRadius: 2,
                                    fontWeight: 'medium'
                                }}
                            >
                                Practice Mode
                            </Typography>
                        </Box>
                    )}
                    
                    <Paper 
                        elevation={0}
                        sx={{ 
                            p: { xs: 2, sm: 3 },
                            backgroundColor: 'background.paper',
                            borderRadius: '4px',
                        }}
                    >
                        <Autocomplete
                            options={searchResults}
                            getOptionLabel={(option) => option.title}
                            inputValue={searchQuery}
                            value={selectedMovie}
                            onInputChange={(_, value) => {
                                setSearchQuery(value);
                                debouncedSearch(value);
                            }}
                            onChange={(_, value) => {
                                if (value) {
                                    getMovieDetails(value.id).then(movieDetails => {
                                        setSelectedMovie(movieDetails);
                                    });
                                } else {
                                    setSelectedMovie(null);
                                }
                            }}
                            loading={loading}
                            renderOption={(props, option) => {
                                const { key, ...otherProps } = props;
                                return (
                                    <li key={option.id} {...otherProps}>
                                        <Box sx={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: 2,
                                            py: 1,
                                        }}>
                                            {option.poster_path && (
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w45${option.poster_path}`}
                                                    alt=""
                                                    style={{ 
                                                        width: 45, 
                                                        height: 68, 
                                                        objectFit: 'cover', 
                                                        borderRadius: '2px',
                                                    }}
                                                />
                                            )}
                                            <Typography variant="body1" fontWeight={500}>
                                                {option.title}
                                            </Typography>
                                        </Box>
                                    </li>
                                );
                            }}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    label="Search movies..."
                                    variant="outlined"
                                    fullWidth
                                    InputProps={{
                                        ...params.InputProps,
                                        endAdornment: (
                                            <>
                                                {loading && <CircularProgress color="inherit" size={20} />}
                                                {params.InputProps.endAdornment}
                                            </>
                                        ),
                                    }}
                                />
                            )}
                            disabled={isPlayingDaily ? (won || hasGivenUp) : (practiceWon || practiceGaveUp)}
                            sx={{ mb: 3 }}
                        />
                        <Box sx={{ 
                            display: 'flex', 
                            gap: 2, 
                            justifyContent: 'center',
                            mt: 2
                        }}>
                            <Button
                                variant="contained"
                                onClick={handleSubmitGuess}
                                disabled={!selectedMovie || (isPlayingDaily ? (won || hasGivenUp) : (practiceWon || practiceGaveUp)) || loading}
                                sx={{
                                    px: 4,
                                    py: 1,
                                    borderRadius: 2,
                                    textTransform: 'none',
                                    fontWeight: 500,
                                }}
                            >
                                Guess
                            </Button>
                            <Button
                                variant="outlined"
                                onClick={handleGetHint}
                                disabled={!targetMovie || (isPlayingDaily ? hintUsed : practiceHintUsed) || (isPlayingDaily ? (won || hasGivenUp) : (practiceWon || practiceGaveUp))}
                                color="secondary"
                                sx={{
                                    px: 4,
                                    py: 1,
                                    borderRadius: 2,
                                    textTransform: 'none',
                                    fontWeight: 500,
                                }}
                            >
                                Get Hint
                            </Button>
                            <Button
                                variant="outlined"
                                onClick={handleGiveUp}
                                disabled={isPlayingDaily ? (won || hasGivenUp) : (practiceWon || practiceGaveUp)}
                                color="error"
                                sx={{
                                    px: 4,
                                    py: 1,
                                    borderRadius: 2,
                                    textTransform: 'none',
                                    fontWeight: 500,
                                }}
                            >
                                Give Up
                            </Button>
                        </Box>
                    </Paper>

                    {((isPlayingDaily && hintUsed) || (!isPlayingDaily && practiceHintUsed)) && targetMovie && (
                        <Box sx={{ 
                            mb: 2, 
                            p: 2, 
                            bgcolor: 'background.paper', 
                            borderRadius: 1,
                            textAlign: 'center'
                        }}>
                            <Typography variant="body1" color="secondary">
                                <strong>Movie Tagline:</strong> {targetMovie.tagline || "No tagline available"}
                            </Typography>
                        </Box>
                    )}

                    {targetMovie && (
                        <Paper sx={{ p: 2 }}>
                            <ContextPanel 
                                targetMovie={targetMovie} 
                                discovered={getDiscoveredInfo()} 
                            />
                        </Paper>
                    )}

                    <GuessHistory />
                </Box>
            </Box>

            <DailyGameOverScreen />
            
            {(showDailyGameEndScreen || 
              (isPlayingDaily && (won || hasGivenUp)) || 
              (!isPlayingDaily && (practiceWon || practiceGaveUp))) && (
                <GameOverScreen
                    won={isPlayingDaily || showDailyGameEndScreen ? won : practiceWon}
                    targetMovie={targetMovie!}
                    guesses={isPlayingDaily || showDailyGameEndScreen ? guesses : practiceGuesses}
                    onNewGame={handleNewGame}
                    onShare={handleShare}
                    showShareMessage={showShareMessage}
                    hintUsed={isPlayingDaily || showDailyGameEndScreen ? hintUsed : practiceHintUsed}
                />
            )}
        </Box>
    );
}; 