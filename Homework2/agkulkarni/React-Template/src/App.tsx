import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { grey } from '@mui/material/colors';
import GenreBarChart from './components/GenreBarChart.jsx'
import RatingYearHeatmap from './components/RatingYearHeatmap.jsx'
import ParallelCoords from './components/ParallelCoords.jsx'

const theme = createTheme({
  palette: {
    primary:{
      main: grey[700],
    },
    secondary:{
      main: grey[700],
    }
  },
})

function Layout() {
  return (
    <Box id='main-container'>
      <div className="dashboard-page">
        <div className="dashboard-grid">
          <div className="dash-cell dash-context">
            <GenreBarChart topN={10} height={255} />
          </div>

          <div className="dash-cell dash-focus">
            <RatingYearHeatmap height={255} />
          </div>

          <div className="dash-cell dash-advanced">
            <ParallelCoords height={255} maxDims={6} minDims={4} maxLines={550} />
          </div>
        </div>
      </div>
    </Box>
  )
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <Layout />
    </ThemeProvider>
  )
}

export default App
