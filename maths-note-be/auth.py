import os
import jwt
from fastapi import Header, HTTPException, status

from constants import APP_SECRET

# Load environment configs
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY")

# Auto-detect Supabase project ID from variables
SUPABASE_PROJECT_ID = os.getenv("SUPABASE_PROJECT_ID")
if not SUPABASE_PROJECT_ID:
    supabase_url = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
    if supabase_url:
        SUPABASE_PROJECT_ID = supabase_url.split("://")[-1].split(".")[0]

if not SUPABASE_PROJECT_ID:
    db_url = os.getenv("DATABASE_URL")
    if db_url:
        try:
            user_part = db_url.split("://")[-1].split("@")[0].split(":")[0]
            if "." in user_part:
                SUPABASE_PROJECT_ID = user_part.split(".")[1]
        except Exception:
            pass

# Initialize JWK client symmetrically/asymmetrically using Supabase's public keys endpoint
jwk_client = None
if SUPABASE_PROJECT_ID:
    jwk_url = f"https://{SUPABASE_PROJECT_ID}.supabase.co/auth/v1/.well-known/jwks.json"
    headers = {}
    if SUPABASE_ANON_KEY:
        headers["apikey"] = SUPABASE_ANON_KEY
    jwk_client = jwt.PyJWKClient(jwk_url, headers=headers)

def verify_app_key(x_app_key: str | None = Header(None)):
    if not x_app_key or x_app_key != APP_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-App-Key header"
        )

def get_current_user(authorization: str | None = Header(None)) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header"
        )
    
    token = authorization.split(" ", 1)[1]
    
    # Local development fallback
    if not jwk_client:
        if token == "test-token-12345":
            return "test-user-uuid-12345"
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Supabase Project ID configuration is missing. Cannot verify tokens."
        )
        
    try:
        # Fetch the signing key from the JWKS endpoint (automatically cached by PyJWKClient)
        signing_key = jwk_client.get_signing_key_from_jwt(token)
        
        # Decode and verify the token using the public key
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience="authenticated"
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token payload is missing subject claim"
            )
        return user_id
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication token has expired"
        )
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid authentication token: {str(e)}"
        )
