import os
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

SPREADSHEET_NAME = "Task - Master"
SHEET_NAME = "Tasks"
DRIVE_FOLDER_NAME = os.getenv("DRIVE_FOLDER_NAME", "task-app")

# Column layout in the sheet (1-indexed for Sheets API, 0-indexed here)
COLUMNS = ["id", "title", "category", "due_date", "status", "order", "last_modified", "never_stale"]
HEADER_ROW = [c.upper() for c in COLUMNS]


def _sheets_service(creds: Credentials):
    return build("sheets", "v4", credentials=creds)


def _drive_service(creds: Credentials):
    return build("drive", "v3", credentials=creds)


def get_or_create_spreadsheet(creds: Credentials) -> str:
    """Return the spreadsheet ID for this user, creating it if needed."""
    drive = _drive_service(creds)

    # Find or create the task-app folder
    folder_res = drive.files().list(
        q=f"name='{DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields="files(id)",
    ).execute()
    folders = folder_res.get("files", [])
    if folders:
        folder_id = folders[0]["id"]
    else:
        folder_meta = {
            "name": DRIVE_FOLDER_NAME,
            "mimeType": "application/vnd.google-apps.folder",
        }
        folder_id = drive.files().create(body=folder_meta, fields="id").execute()["id"]

    # Find or create the spreadsheet inside the folder
    sheet_res = drive.files().list(
        q=f"name='{SPREADSHEET_NAME}' and '{folder_id}' in parents and trashed=false",
        fields="files(id)",
    ).execute()
    sheets = sheet_res.get("files", [])
    if sheets:
        return sheets[0]["id"]

    sheets_svc = _sheets_service(creds)
    spreadsheet = sheets_svc.spreadsheets().create(body={
        "properties": {"title": SPREADSHEET_NAME},
        "sheets": [{"properties": {"title": SHEET_NAME}}],
    }).execute()
    spreadsheet_id = spreadsheet["spreadsheetId"]

    # Move into folder
    drive.files().update(
        fileId=spreadsheet_id,
        addParents=folder_id,
        removeParents="root",
        fields="id, parents",
    ).execute()

    # Write header row
    sheets_svc.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"{SHEET_NAME}!A1",
        valueInputOption="RAW",
        body={"values": [HEADER_ROW]},
    ).execute()

    return spreadsheet_id


def read_all_rows(creds: Credentials, spreadsheet_id: str) -> list[dict]:
    svc = _sheets_service(creds)
    result = svc.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=f"{SHEET_NAME}!A1:Z",
    ).execute()
    rows = result.get("values", [])
    if len(rows) < 2:
        return []
    header = [h.lower() for h in rows[0]]
    return [dict(zip(header, row)) for row in rows[1:]]


def write_all_rows(creds: Credentials, spreadsheet_id: str, tasks: list[dict]) -> None:
    svc = _sheets_service(creds)
    values = [HEADER_ROW] + [
        [str(t.get(col, "")) for col in COLUMNS] for t in tasks
    ]
    svc.spreadsheets().values().update(
        spreadsheetId=spreadsheet_id,
        range=f"{SHEET_NAME}!A1",
        valueInputOption="RAW",
        body={"values": values},
    ).execute()

    # Clear any rows beyond what we wrote
    last_row = len(values) + 1
    svc.spreadsheets().values().clear(
        spreadsheetId=spreadsheet_id,
        range=f"{SHEET_NAME}!A{last_row}:Z",
    ).execute()
