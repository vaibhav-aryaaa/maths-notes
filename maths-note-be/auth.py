from fastapi import Header, HTTPException, status
from typing import Optional
from constants import APP_SECRET

def verify_app_key(x_app_key: Optional[str] = Header(None)):
    if not x_app_key or x_app_key != APP_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-App-Key header"
        )
