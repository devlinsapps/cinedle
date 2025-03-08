import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { MovieGame } from './components/MovieGame'

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#00E054', // Letterboxd green
    },
    secondary: {
      main: '#456', // Letterboxd secondary blue-grey
    },
    background: {
      default: '#14181c', // Letterboxd dark background
      paper: '#1c2228', // Slightly lighter than background
    },
    text: {
      primary: '#fff',
      secondary: 'rgba(255, 255, 255, 0.7)',
    },
  },
  typography: {
    fontFamily: '"Graphik", "Helvetica Neue", Arial, sans-serif',
    h1: {
      fontSize: '2.5rem',
      '@media (max-width:600px)': {
        fontSize: '2rem',
      },
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <MovieGame />
    </ThemeProvider>
  )
}

export default App
