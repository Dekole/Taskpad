## Overview
This app will serve as a intermediary for Claude sessions to save notes and todos on a home server so that these notes and todos can be acted upon at a later date when the user has more time.

The use-case of this is:
- User talks to claude mobile (voice) in a car to write down ideas to save to server (mobile has no memory)
-- Journaling
-- Software design
-- Project design
-- Learnings

## Requirements 
V1
1. The system shall be able to executed in a localy hosted server and be accessible by claude mobile externally via a ege.g. mcp connection
2. The system shall have a mechansim to create projects (e.g. initiated by a Claude voice command)
3. The system shall have a mechanism to select different projects during a Claude session
4. The system shall have a way to save and retrieve notes from the system - by Claude or API
5. The system shall allow users to list all current project and files
6. All notes on the file shall be preceded by a simple title for browsing purposes
7. The system shall work in a default project "default" if users didn't specify one in a claude session
8. System shall be secure and prevent unauthorized access

VFuture
1. System shall allow the creation of tasks lists

