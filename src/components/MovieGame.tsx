import React, { useState, useEffect } from 'react';
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
import { searchMovies, getMovieDetails, getRandomPopularMovie, compareMovies } from '../services/tmdb';
import { debounce } from '@mui/material/utils';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Card from '@mui/material/Card';
import CardMedia from '@mui/material/CardMedia';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';

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
    const initRef = React.useRef(false);

    const initializeGame = async () => {
        console.log('Init state:', { isInitializing, initRef: initRef.current });
        
        if (initRef.current) {
            console.log('Already initialized, skipping');
            return;
        }
        
        setIsInitializing(true);
        console.log('Starting game initialization...');
        
        try {
            const movie = await getRandomPopularMovie();
            console.log('Received movie:', movie);
            setTargetMovie(movie);
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
            setGuesses(prev => [...prev, result] as MovieGuessResult[]);

            if (result.isCorrect) {
                setWon(true);
            }
        } catch (error) {
            console.error('Failed to process guess:', error);
        } finally {
            setLoading(false);
            setSearchQuery('');
            setSelectedMovie(null);
        }
    };

    const handleNewGame = () => {
        setGuesses([]);
        setSearchQuery('');
        setSearchResults([]);
        setWon(false);
        setHasGivenUp(false);
        setShowShareMessage(false);
        setTargetMovie(null);
        setHintUsed(false);
        if (initRef.current) {
            initRef.current = false;
        }
        initializeGame();
    };

    const handleGiveUp = () => {
        setHasGivenUp(true);
    };

    const handleGetHint = () => {
        if (targetMovie && !hintUsed) {
            setHintUsed(true);
        }
    };

    const generateShareText = () => {
        const guessCount = guesses.length;
        const hintIndicator = hintUsed ? ' (with hint 💡)' : '';
        
        return `I ${won ? 'got' : 'failed'} the Cinedle in ${guessCount} guesses${hintIndicator}!

Play at: https://cinedle.com`;
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
        if (guesses.length === 0) return null;

        const discovered = {
            cast: new Set<number>(),
            crew: new Set<number>(),
            genres: new Set<number>(),
            productionCompanies: new Set<number>(),
            year: false,
            runtime: false,
            collection: false,
        };

        guesses.forEach(guess => {
            guess.commonCast.forEach(cast => discovered.cast.add(cast.id));
            guess.commonCrew.forEach(crew => discovered.crew.add(crew.id));
            guess.commonGenres.forEach(genre => discovered.genres.add(genre.id));
            guess.commonProductionCompanies.forEach(company => discovered.productionCompanies.add(company.id));
            
            if (guess.releaseYear.match) discovered.year = true;
            if (guess.sameCollection) discovered.collection = true;
        });

        return discovered;
    };

    const GuessHistory = () => (
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
                Previous Guesses ({guesses.length})
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {guesses.slice().reverse().map((guess, index) => (
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

    const GameOverScreen = ({ 
        hasWon, 
        guessCount, 
        onNewGame, 
        onShare,
        showShareMessage,
        targetMovie,
        onClose
    }: {
        hasWon: boolean;
        guessCount: number;
        onNewGame: () => void;
        onShare: () => void;
        showShareMessage: boolean;
        targetMovie: Movie;
        onClose: () => void;
    }) => {
        return (
            <Dialog 
                open={true}
                maxWidth="sm"
                fullWidth
                onClose={onClose}
                sx={{
                    '& .MuiDialog-paper': {
                        backgroundColor: 'background.paper',
                    }
                }}
            >
                <DialogTitle sx={{ m: 0, p: 2, pr: 6 }}>
                    {hasWon ? '🎉 Congratulations!' : '😔 Better luck next time!'}
                    <IconButton
                        aria-label="close"
                        onClick={onClose}
                        sx={{
                            position: 'absolute',
                            right: 8,
                            top: 8,
                            color: (theme) => theme.palette.grey[500],
                        }}
                    >
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Typography variant="h6">
                            {targetMovie.title} ({targetMovie.release_date.split('-')[0]})
                        </Typography>
                        
                        <Card>
                            <CardMedia
                                component="img"
                                image={`https://image.tmdb.org/t/p/w500${targetMovie.poster_path}`}
                                alt={targetMovie.title}
                                sx={{ maxHeight: '400px', objectFit: 'contain' }}
                            />
                        </Card>

                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Typography variant="body2">
                                <strong>Release Date:</strong> {targetMovie.release_date}
                            </Typography>
                            <Typography variant="body2">
                                <strong>Genres:</strong> {targetMovie.genres.map(g => g.name).join(', ')}
                            </Typography>
                            <Typography variant="body2">
                                <strong>Runtime:</strong> {targetMovie.runtime || 'N/A'} minutes
                            </Typography>
                            {targetMovie.budget && targetMovie.budget > 0 && (
                                <Typography variant="body2">
                                    <strong>Budget:</strong> ${targetMovie.budget.toLocaleString()}
                                </Typography>
                            )}
                            {targetMovie.revenue && targetMovie.revenue > 0 && (
                                <Typography variant="body2">
                                    <strong>Revenue:</strong> ${targetMovie.revenue.toLocaleString()}
                                </Typography>
                            )}
                            {targetMovie.belongs_to_collection && (
                                <Typography variant="body2">
                                    <strong>Collection:</strong> {targetMovie.belongs_to_collection.name}
                                </Typography>
                            )}
                            
                            {/* Cast Section */}
                            {targetMovie.cast.length > 0 && (
                                <Typography variant="body2">
                                    <strong>Cast:</strong> {targetMovie.cast.slice(0, 5).map(c => `${c.name} (${c.character})`).join(', ')}
                                </Typography>
                            )}
                            
                            {/* Director Section */}
                            {targetMovie.crew.some(c => c.job === 'Director') && (
                                <Typography variant="body2">
                                    <strong>Director:</strong> {
                                        targetMovie.crew
                                            .filter(c => c.job === 'Director')
                                            .map(c => c.name)
                                            .join(', ')
                                    }
                                </Typography>
                            )}
                        </Box>

                        <Box>
                            <Typography variant="body2">
                                {hasWon 
                                    ? `You got it in ${guessCount} ${guessCount === 1 ? 'guess' : 'guesses'}!` 
                                    : 'Better luck next time!'}
                            </Typography>
                            {showShareMessage && (
                                <Typography color="success.main">
                                    Results copied to clipboard!
                                </Typography>
                            )}
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2, gap: 1 }}>
                    <Button 
                        variant="contained" 
                        onClick={onShare}
                        color="primary"
                    >
                        {showShareMessage ? 'Copied!' : 'Share Results'}
                    </Button>
                    <Button 
                        variant="contained" 
                        onClick={onNewGame}
                        color="secondary"
                    >
                        New Game
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
                    Guess the movie in as few tries as possible. Each guess reveals matching cast, crew, and other details.
                </Typography>
                <Button
                    variant="outlined"
                    onClick={handleNewGame}
                    startIcon={<RefreshIcon />}
                    sx={{
                        borderRadius: 2,
                        textTransform: 'none',
                        px: 3,
                    }}
                >
                    New Game
                </Button>
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
                            disabled={won || hasGivenUp}
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
                                disabled={!selectedMovie || won || hasGivenUp || loading}
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
                                disabled={!targetMovie || hintUsed || won || hasGivenUp}
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
                                disabled={won || hasGivenUp}
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

                    {guesses.length > 0 && (
                        <>
                            {hintUsed && targetMovie && (
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
                        </>
                    )}
                </Box>
            </Box>

            {(won || hasGivenUp) && (
                <GameOverScreen
                    hasWon={won}
                    guessCount={guesses.length}
                    onNewGame={handleNewGame}
                    onShare={handleShare}
                    showShareMessage={showShareMessage}
                    targetMovie={targetMovie!}
                    onClose={() => {
                        setWon(false);
                        setHasGivenUp(false);
                    }}
                />
            )}
        </Box>
    );
}; 