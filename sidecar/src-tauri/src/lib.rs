//! Sidecar Tauri Backend
//!
//! Provides database operations, credential management, and OAuth support
//! for the Sidecar AI Communication Assistant.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use parking_lot::Mutex;
use rand::Rng;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;
use thiserror::Error;
use uuid::Uuid;

// ============================================================================
// Error Types
// ============================================================================

#[derive(Error, Debug)]
pub enum SidecarError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("Encryption error: {0}")]
    Encryption(String),

    #[error("Keyring error: {0}")]
    Keyring(String),

    #[error("Invalid state: {0}")]
    InvalidState(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

impl Serialize for SidecarError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

// ============================================================================
// State Management
// ============================================================================

pub struct AppState {
    db: Mutex<Option<Connection>>,
    encryption_key: Mutex<Option<[u8; 32]>>,
    oauth_states: Mutex<HashMap<String, String>>,
}

impl AppState {
    fn new() -> Self {
        Self {
            db: Mutex::new(None),
            encryption_key: Mutex::new(None),
            oauth_states: Mutex::new(HashMap::new()),
        }
    }
}

// ============================================================================
// Database Commands
// ============================================================================

/// Initialize the database with the given path
#[tauri::command]
pub fn db_init(state: State<'_, Arc<AppState>>, path: Option<String>) -> Result<(), SidecarError> {
    let db_path = path.map(PathBuf::from).unwrap_or_else(|| {
        let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push("sidecar");
        std::fs::create_dir_all(&path).ok();
        path.push("sidecar.db");
        path
    });

    let conn = Connection::open(&db_path)?;

    // Enable WAL mode for better performance
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;

    let mut db = state.db.lock();
    *db = Some(conn);

    Ok(())
}

/// Execute a SQL statement (INSERT, UPDATE, DELETE, CREATE)
#[tauri::command]
pub fn db_execute(
    state: State<'_, Arc<AppState>>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<usize, SidecarError> {
    let db = state.db.lock();
    let conn = db.as_ref().ok_or(SidecarError::InvalidState(
        "Database not initialized".to_string(),
    ))?;

    let params: Vec<Box<dyn rusqlite::ToSql>> = params
        .iter()
        .map(|v| json_to_sql(v))
        .collect();

    let refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

    let affected = conn.execute(&sql, refs.as_slice())?;
    Ok(affected)
}

/// Query the database and return results as JSON
#[tauri::command]
pub fn db_query(
    state: State<'_, Arc<AppState>>,
    sql: String,
    params: Vec<serde_json::Value>,
) -> Result<Vec<serde_json::Value>, SidecarError> {
    let db = state.db.lock();
    let conn = db.as_ref().ok_or(SidecarError::InvalidState(
        "Database not initialized".to_string(),
    ))?;

    let params: Vec<Box<dyn rusqlite::ToSql>> = params
        .iter()
        .map(|v| json_to_sql(v))
        .collect();

    let refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|b| b.as_ref()).collect();

    let mut stmt = conn.prepare(&sql)?;
    let column_count = stmt.column_count();
    let column_names: Vec<String> = stmt
        .column_names()
        .iter()
        .map(|s| s.to_string())
        .collect();

    let rows = stmt.query_map(refs.as_slice(), |row| {
        let mut map = serde_json::Map::new();
        for i in 0..column_count {
            let value = row_value_to_json(row, i);
            map.insert(column_names[i].clone(), value);
        }
        Ok(serde_json::Value::Object(map))
    })?;

    let results: Result<Vec<_>, _> = rows.collect();
    Ok(results?)
}

fn json_to_sql(value: &serde_json::Value) -> Box<dyn rusqlite::ToSql> {
    match value {
        serde_json::Value::Null => Box::new(rusqlite::types::Null),
        serde_json::Value::Bool(b) => Box::new(*b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Box::new(i)
            } else if let Some(f) = n.as_f64() {
                Box::new(f)
            } else {
                Box::new(n.to_string())
            }
        }
        serde_json::Value::String(s) => Box::new(s.clone()),
        _ => Box::new(value.to_string()),
    }
}

fn row_value_to_json(row: &rusqlite::Row, idx: usize) -> serde_json::Value {
    // Try different types in order of likelihood
    if let Ok(s) = row.get::<_, String>(idx) {
        serde_json::Value::String(s)
    } else if let Ok(i) = row.get::<_, i64>(idx) {
        serde_json::Value::Number(i.into())
    } else if let Ok(f) = row.get::<_, f64>(idx) {
        serde_json::json!(f)
    } else if let Ok(b) = row.get::<_, bool>(idx) {
        serde_json::Value::Bool(b)
    } else if let Ok(bytes) = row.get::<_, Vec<u8>>(idx) {
        serde_json::Value::String(BASE64.encode(&bytes))
    } else {
        serde_json::Value::Null
    }
}

// ============================================================================
// Encryption Commands
// ============================================================================

/// Initialize encryption with a password-derived key
#[tauri::command]
pub fn init_encryption(
    state: State<'_, Arc<AppState>>,
    password: String,
) -> Result<(), SidecarError> {
    let mut hasher = Sha256::new();
    hasher.update(password.as_bytes());
    hasher.update(b"sidecar-encryption-salt-v1");
    let result = hasher.finalize();

    let mut key = [0u8; 32];
    key.copy_from_slice(&result);

    let mut encryption_key = state.encryption_key.lock();
    *encryption_key = Some(key);

    Ok(())
}

/// Encrypt data for storage
#[tauri::command]
pub fn encrypt_data(
    state: State<'_, Arc<AppState>>,
    plaintext: String,
) -> Result<String, SidecarError> {
    let key = state.encryption_key.lock();
    let key = key
        .as_ref()
        .ok_or(SidecarError::Encryption("Encryption not initialized".to_string()))?;

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| SidecarError::Encryption(e.to_string()))?;

    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| SidecarError::Encryption(e.to_string()))?;

    // Combine nonce + ciphertext and encode as base64
    let mut combined = nonce_bytes.to_vec();
    combined.extend(ciphertext);

    Ok(BASE64.encode(&combined))
}

/// Decrypt data from storage
#[tauri::command]
pub fn decrypt_data(
    state: State<'_, Arc<AppState>>,
    ciphertext: String,
) -> Result<String, SidecarError> {
    let key = state.encryption_key.lock();
    let key = key
        .as_ref()
        .ok_or(SidecarError::Encryption("Encryption not initialized".to_string()))?;

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| SidecarError::Encryption(e.to_string()))?;

    let combined = BASE64
        .decode(&ciphertext)
        .map_err(|e| SidecarError::Encryption(e.to_string()))?;

    if combined.len() < 12 {
        return Err(SidecarError::Encryption("Invalid ciphertext".to_string()));
    }

    let (nonce_bytes, ciphertext_bytes) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext_bytes)
        .map_err(|e| SidecarError::Encryption(e.to_string()))?;

    String::from_utf8(plaintext).map_err(|e| SidecarError::Encryption(e.to_string()))
}

// ============================================================================
// Credential Storage Commands (System Keychain)
// ============================================================================

const KEYRING_SERVICE: &str = "sidecar-app";

/// Store credentials in system keychain
#[tauri::command]
pub fn store_credentials(provider: String, credentials: String) -> Result<(), SidecarError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &provider)
        .map_err(|e| SidecarError::Keyring(e.to_string()))?;

    entry
        .set_password(&credentials)
        .map_err(|e| SidecarError::Keyring(e.to_string()))?;

    Ok(())
}

/// Get credentials from system keychain
#[tauri::command]
pub fn get_credentials(provider: String) -> Result<Option<String>, SidecarError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &provider)
        .map_err(|e| SidecarError::Keyring(e.to_string()))?;

    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(SidecarError::Keyring(e.to_string())),
    }
}

/// Delete credentials from system keychain
#[tauri::command]
pub fn delete_credentials(provider: String) -> Result<(), SidecarError> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &provider)
        .map_err(|e| SidecarError::Keyring(e.to_string()))?;

    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()), // Already deleted
        Err(e) => Err(SidecarError::Keyring(e.to_string())),
    }
}

// ============================================================================
// OAuth State Management
// ============================================================================

/// Store OAuth state for CSRF protection
#[tauri::command]
pub fn store_oauth_state(
    state: State<'_, Arc<AppState>>,
    provider: String,
    oauth_state: String,
) -> Result<(), SidecarError> {
    let mut states = state.oauth_states.lock();
    states.insert(provider, oauth_state);
    Ok(())
}

/// Validate OAuth state
#[tauri::command]
pub fn validate_oauth_state(
    state: State<'_, Arc<AppState>>,
    provider: String,
    oauth_state: String,
) -> Result<bool, SidecarError> {
    let mut states = state.oauth_states.lock();
    if let Some(stored) = states.get(&provider) {
        if stored == &oauth_state {
            states.remove(&provider);
            return Ok(true);
        }
    }
    Ok(false)
}

// ============================================================================
// Utility Commands
// ============================================================================

/// Generate a random string for OAuth state
#[tauri::command]
pub fn generate_random_string(length: usize) -> String {
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();

    (0..length)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// Generate a secure ID (UUID v4)
#[tauri::command]
pub fn generate_secure_id() -> String {
    Uuid::new_v4().to_string()
}

/// Open a URL in the system browser
#[tauri::command]
pub fn open_browser(url: String) -> Result<(), SidecarError> {
    open::that(&url).map_err(|e| SidecarError::InvalidState(e.to_string()))?;
    Ok(())
}

/// Get the app data directory
#[tauri::command]
pub fn get_app_data_dir() -> Result<String, SidecarError> {
    let mut path = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("sidecar");
    std::fs::create_dir_all(&path)
        .map_err(|e| SidecarError::InvalidState(e.to_string()))?;

    path.to_str()
        .map(|s| s.to_string())
        .ok_or(SidecarError::InvalidState("Invalid path".to_string()))
}

// ============================================================================
// Tauri App Entry Point
// ============================================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = Arc::new(AppState::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            // Database
            db_init,
            db_execute,
            db_query,
            // Encryption
            init_encryption,
            encrypt_data,
            decrypt_data,
            // Credentials
            store_credentials,
            get_credentials,
            delete_credentials,
            // OAuth
            store_oauth_state,
            validate_oauth_state,
            // Utilities
            generate_random_string,
            generate_secure_id,
            open_browser,
            get_app_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
