/**
 * 阅读主题。阅读器与设置页共用，保证预览和正文颜色一致。
 */

export const READER_THEMES = {
  paper: {
    key: 'paper',
    name: '宣纸',
    background: '#f5eddd',
    surface: '#fbf6ea',
    text: '#2c2a24',
    secondary: '#8b8271',
    line: 'rgba(44, 42, 36, 0.12)',
    accent: '#a8493a',
    statusBar: 'dark'
  },
  green: {
    key: 'green',
    name: '青笺',
    background: '#e7eee2',
    surface: '#f0f5eb',
    text: '#24352b',
    secondary: '#6f7f72',
    line: 'rgba(36, 53, 43, 0.12)',
    accent: '#3f6b56',
    statusBar: 'dark'
  },
  gray: {
    key: 'gray',
    name: '素灰',
    background: '#e9ebee',
    surface: '#f4f5f7',
    text: '#2d3137',
    secondary: '#7b818a',
    line: 'rgba(45, 49, 55, 0.12)',
    accent: '#4d6478',
    statusBar: 'dark'
  },
  night: {
    key: 'night',
    name: '夜读',
    background: '#111417',
    surface: '#191d21',
    text: '#c8c5bd',
    secondary: '#767d84',
    line: 'rgba(200, 197, 189, 0.12)',
    accent: '#c0715f',
    statusBar: 'light'
  }
}

export const THEME_LIST = Object.values(READER_THEMES)

export function getTheme(key) {
  return READER_THEMES[key] || READER_THEMES.paper
}
