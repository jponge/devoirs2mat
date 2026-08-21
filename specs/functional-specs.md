# Functional specifications

## Application user

The application user is a student (typically aged 6-18) who needs to manage homework at home and in the classroom.

It is localized in English and French, and the current language is detected on startup.

## What the application does in the main view

- The focus is on homework entries
- The application offers daily and weekly views
- A homework entry has some text, a due date, a course, and a completion mark
- When a homework entry is completed, it stills show in the current day or weekly view
- In a weekly view, we have blocks per-day, and homework entries are grouped under matching courses
- In the top we will have a component to select the current day:
    - in the daily view this selects the current day
    - in the weekly view this puts us in the week of the current day
    - the date selection component will be surrounded by:
        - previous / next day buttons in daily view
        - previous / next week in weekly view
- The workflows and user interface are clean and progressive:
    - when the mouse goes over a homework item, a button to edit appears
    - when the mouse goes over a day block (in weekly view), then a button to quickly add a new entry appears

## What the application offers in a side panel

A side panel exposes further operations:

- changing the current language
- editing courses, but deleting a course does not delete the existing homework items no matter if they have been
  completed or not
- exporting and importing data: we want to ensure backups are restores are possible, and to do that we want to export
  the database schema and content as SQL scripts for maximum portability

## What the application doesn't do in any view

- It doesn't track results / exams
- It has no remote cloud synchronization
- We do not need to re-order courses, when they need to be sorted, we assume alphabetical order
