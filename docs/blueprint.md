# **App Name**: SmartLibTrack

## Core Features:

- Student Self-Registration: Allow students to register by scanning their ID card barcode using the device camera, capturing the barcode image, and entering their details manually.
- Barcode Data Extraction: Use a generative AI tool to extract the ID number from the barcode image or the text below the barcode.
- Entry/Exit Tracking: Record student entry and exit times by scanning their ID card barcode, ensuring a minimum 10-second interval between scans.

## Style Guidelines:

- Primary color: Clean white or light grey for the background.
- Secondary color: Muted blue (#3498db) for headers and primary actions.
- Accent: Teal (#008080) for interactive elements and highlights.
- Use a clear, card-based layout to present student data and entry/exit logs.
- Use recognizable icons for actions like 'scan,' 'enter,' and 'exit.'
- Subtle transition animations to indicate successful scans and data entries.

## Original User Request:
I want a app for library, every student have their own id card & on that they have barcode. so i want app that using that barcode the student entry & exit will be recorded & saved to excel sheet as well as sqlite for easy retreival. between entry & exit there should be atleast 10 second of difference should be there. there should be 2 login one for admin i.e for librarian another for student student is new then he will register from his side for that he will first click the image with camera of bar code or id card it will be saved & then user will enter his information by himself, i want to use a model that will extract or understand bar code or to extract the numbers written below the barcode.
use: @https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent' 

also same for admin side admin also can add students data by his side he can scan or upload the id card image or direct barcode image & can enter student details & save them.
Data should be saved will me name of student, branch (we have computer, electronic, civil, mechanic, ellectrical admin can add branches by himself), Roll no, Id no.( same as no. below barcode), year of study (Fy, Sy, Ty). this above is common info which will be saved separately.
now about entries on the basis of id card barcode no. (id no.) the entries & exist of students will be recorded. a student can stay minimum of 10-15 sec in library if student scan again it will stored as exit, a student can enter library many time in a day it will check previous is entry or exit then add new entry. the entries i.e entry & exit will be stored with student id branch, name, date time & entreis this all is saved in different excal & sqlite they will gradually update & add entries, admin have permission to add or specify file name it will hen start storing in them but all previos files also be linked with each other so it can be stored dynamicaly wih updates
  