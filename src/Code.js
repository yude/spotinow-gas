/**
 * Spotinow for Google Apps Script.
 */

const APP_CONFIG = Object.freeze({
  spotifyTokenUrl: 'https://accounts.spotify.com/api/token',
  spotifyApiBase: 'https://api.spotify.com/v1',
  scopes: 'user-read-currently-playing user-read-recently-played playlist-modify-public user-top-read',
});

function doGet(e) {
  if (e.parameter.code) {
    return handleCallback_(e.parameter.code);
  }

  const props = PropertiesService.getScriptProperties();
  if (e.parameter.setup === 'true' || !props.getProperty('SPOTIFY_REFRESH_TOKEN')) {
    const html = HtmlService.createTemplateFromFile('Setup');
    html.authUrl = getSpotifyAuthUrl_();
    html.isConfigured = !!props.getProperty('SPOTIFY_REFRESH_TOKEN');
    return html.evaluate().setTitle('Setup | Spotify Dashboard');
  }

  const template = HtmlService.createTemplateFromFile('Index');
  
  try {
    const data = fetchSpotifyData_();
    template.current_track = data.current_track;
    template.tracks = data.history;
  } catch (err) {
    if (err.message.includes('Auth')) {
      const html = HtmlService.createTemplateFromFile('Setup');
      html.authUrl = getSpotifyAuthUrl_();
      html.isConfigured = false;
      html.error = err.message;
      return html.evaluate().setTitle('Setup | Spotify Dashboard');
    }
    template.current_track = null;
    template.tracks = [];
    template.error = err.toString();
  }

  return template.evaluate().setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setTitle('Spotify Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getSpotifyAuthUrl_() {
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('SPOTIFY_CLIENT_ID');
  if (!clientId) return '#';
  
  const redirectUri = ScriptApp.getService().getUrl();
  return `https://accounts.spotify.com/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(APP_CONFIG.scopes)}`;
}

function handleCallback_(code) {
  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('SPOTIFY_CLIENT_ID');
  const clientSecret = props.getProperty('SPOTIFY_CLIENT_SECRET');
  const redirectUri = ScriptApp.getService().getUrl();

  const basicCredential = Utilities.base64Encode(`${clientId}:${clientSecret}`, Utilities.Charset.UTF_8);

  const response = UrlFetchApp.fetch(APP_CONFIG.spotifyTokenUrl, {
    method: 'post',
    payload: {
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri
    },
    headers: {
      Authorization: `Basic ${basicCredential}`
    },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() >= 300) {
    return HtmlService.createHtmlOutput(`<h1>Auth Error</h1><pre>${response.getContentText()}</pre>`);
  }

  const payload = JSON.parse(response.getContentText());
  if (payload.refresh_token) {
    props.setProperty('SPOTIFY_REFRESH_TOKEN', payload.refresh_token);
  }

  return HtmlService.createHtmlOutput(`<h1>Setup Complete!</h1><p>Close this tab or <a href="${redirectUri}">go to dashboard</a>.</p>`);
}

function getAccessToken_() {
  const cache = CacheService.getScriptCache();
  const cachedToken = cache.get('spotify_access_token');
  if (cachedToken) return cachedToken;

  const props = PropertiesService.getScriptProperties();
  const clientId = props.getProperty('SPOTIFY_CLIENT_ID');
  const clientSecret = props.getProperty('SPOTIFY_CLIENT_SECRET');
  const refreshToken = props.getProperty('SPOTIFY_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Auth properties missing');
  }

  const basicCredential = Utilities.base64Encode(`${clientId}:${clientSecret}`, Utilities.Charset.UTF_8);

  const response = UrlFetchApp.fetch(APP_CONFIG.spotifyTokenUrl, {
    method: 'post',
    payload: {
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    },
    headers: {
      Authorization: `Basic ${basicCredential}`
    },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() >= 300) {
    throw new Error(`Token refresh failed: ${response.getContentText()}`);
  }

  const payload = JSON.parse(response.getContentText());
  const token = payload.access_token;
  // payload.expires_in is usually 3600 (1 hour). Cache for 50 minutes.
  cache.put('spotify_access_token', token, 3000);
  
  if (payload.refresh_token) {
    props.setProperty('SPOTIFY_REFRESH_TOKEN', payload.refresh_token);
  }

  return token;
}

function pickAlbumImage_(images, preferredIndex = 0) {
  if (!images || images.length === 0) return null;
  const safeIndex = preferredIndex < images.length ? preferredIndex : 0;
  return images[safeIndex].url;
}

function formatTimeMs_(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function formatTrackItem_(item, progress_ms = 0, is_playing = true) {
  const duration_ms = item.duration_ms || 0;
  const percent = duration_ms > 0 ? (progress_ms / duration_ms) * 100 : 0;

  return {
    name: item.name,
    artist: (item.artists || []).map(a => a.name).join(', '),
    album: item.album ? item.album.name : '',
    url: item.external_urls ? item.external_urls.spotify : '',
    image_url: pickAlbumImage_(item.album ? item.album.images : []),
    progress_ms: progress_ms,
    duration_ms: duration_ms,
    progress_percent: Math.min(100, Math.max(0, percent)),
    progress_str: formatTimeMs_(progress_ms),
    duration_str: formatTimeMs_(duration_ms),
    is_playing: is_playing
  };
}

function formatHistoryItems_(items) {
  return items.map(value => {
    const track = value.track;
    const date = new Date(value.played_at);
    // Convert to JST representation directly
    const jstDate = new Date(date.getTime() + (9 * 60 * 60 * 1000));
    const pad = n => n.toString().padStart(2, '0');
    const playedAtStr = `${jstDate.getUTCFullYear()}-${pad(jstDate.getUTCMonth() + 1)}-${pad(jstDate.getUTCDate())} ${pad(jstDate.getUTCHours())}:${pad(jstDate.getUTCMinutes())}:${pad(jstDate.getUTCSeconds())}`;
    
    return {
      played_at: playedAtStr,
      name: track.name,
      artist: (track.artists || []).map(a => a.name).join(', '),
      album: track.album ? track.album.name : '',
      url: track.external_urls ? track.external_urls.spotify : '',
      image_url: pickAlbumImage_(track.album ? track.album.images : [], 1)
    };
  });
}

function fetchSpotifyData_() {
  const token = getAccessToken_();
  const reqs = [
    {
      url: `${APP_CONFIG.spotifyApiBase}/me/player/currently-playing`,
      headers: { Authorization: `Bearer ${token}` },
      muteHttpExceptions: true
    },
    {
      url: `${APP_CONFIG.spotifyApiBase}/me/player/recently-played?limit=50`,
      headers: { Authorization: `Bearer ${token}` },
      muteHttpExceptions: true
    }
  ];

  const responses = UrlFetchApp.fetchAll(reqs);
  
  let currentTrackRaw = null;
  if (responses[0].getResponseCode() === 200) {
    const text = responses[0].getContentText();
    if (text) {
      currentTrackRaw = JSON.parse(text);
    }
  }

  let history = { items: [] };
  if (responses[1].getResponseCode() === 200) {
    const text = responses[1].getContentText();
    if (text) {
      history = JSON.parse(text);
    }
  }

  let current_track = null;
  if (currentTrackRaw && currentTrackRaw.item) {
    current_track = formatTrackItem_(
      currentTrackRaw.item,
      currentTrackRaw.progress_ms,
      currentTrackRaw.is_playing
    );
  }

  const formattedHistory = formatHistoryItems_(history.items || []);

  return {
    current_track: current_track,
    history: formattedHistory
  };
}

// API Endpoints called from Frontend via google.script.run
function apiTopTracks(timeRange) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'top_tracks_' + timeRange;
  const cached = cache.get(cacheKey);
  if (cached) return { tracks: JSON.parse(cached), cached: true };

  const token = getAccessToken_();
  const response = UrlFetchApp.fetch(`${APP_CONFIG.spotifyApiBase}/me/top/tracks?limit=20&time_range=${timeRange}`, {
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() >= 300) {
    throw new Error(`Failed to fetch top tracks: ${response.getContentText()}`);
  }

  const payload = JSON.parse(response.getContentText());
  const tracks = (payload.items || []).map((item, idx) => ({
    rank: idx + 1,
    name: item.name,
    artist: (item.artists || []).map(a => a.name).join(', '),
    album: item.album ? item.album.name : '',
    url: item.external_urls ? item.external_urls.spotify : '',
    image_url: pickAlbumImage_(item.album ? item.album.images : [], 1)
  }));

  cache.put(cacheKey, JSON.stringify(tracks), 3600);
  return { tracks: tracks, cached: false };
}

function apiTopArtists(timeRange) {
  const cache = CacheService.getScriptCache();
  const cacheKey = 'top_artists_' + timeRange;
  const cached = cache.get(cacheKey);
  if (cached) return { artists: JSON.parse(cached), cached: true };

  const token = getAccessToken_();
  const response = UrlFetchApp.fetch(`${APP_CONFIG.spotifyApiBase}/me/top/artists?limit=20&time_range=${timeRange}`, {
    headers: { Authorization: `Bearer ${token}` },
    muteHttpExceptions: true
  });

  if (response.getResponseCode() >= 300) {
    throw new Error(`Failed to fetch top artists: ${response.getContentText()}`);
  }

  const payload = JSON.parse(response.getContentText());
  const artists = (payload.items || []).map((item, idx) => {
    const genres = item.genres || [];
    const genre_str = genres.length > 0 ? genres.slice(0, 2).join(', ') : 'Genre Unspecified';
    return {
      rank: idx + 1,
      name: item.name,
      genre: genre_str,
      url: item.external_urls ? item.external_urls.spotify : '',
      image_url: pickAlbumImage_(item.images || [], 1)
    };
  });

  cache.put(cacheKey, JSON.stringify(artists), 3600);
  return { artists: artists, cached: false };
}


function apiGetDashboardHtml() {
  const template = HtmlService.createTemplateFromFile('Index');
  try {
    const data = fetchSpotifyData_();
    template.current_track = data.current_track;
    template.tracks = data.history;
  } catch (err) {
    template.current_track = null;
    template.tracks = [];
    template.error = err.toString();
  }
  return template.evaluate().getContent();
}

// Escapes strings for safe injection into inline JavaScript within the GAS template
function escapeGas(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}
