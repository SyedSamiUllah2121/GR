import { Template, TemplateKey } from '../types';

export const TEMPLATES: Record<TemplateKey, Template> = {
  kitchen: {
    key: 'kitchen',
    label: 'Kitchen hygiene checklist',
    sections: [
      {
        title: 'Personal hygiene',
        items: [
          { id: 1, text: 'Employees are wearing proper uniform', reasonGroup: 'STAFF' },
          { id: 2, text: 'Staff wearing hairnets (includes kitchen staff and dishwasher)', reasonGroup: 'STAFF' },
          { id: 3, text: 'Male and female fingernails trimmed', reasonGroup: 'STAFF' },
          { id: 4, text: 'Working employees must wear shoes', reasonGroup: 'STAFF' },
          { id: 5, text: 'Gloves are worn while preparing and serving food', reasonGroup: 'STAFF' },
          { id: 6, text: 'Walls and ceilings are clean', reasonGroup: 'CLEANING' },
        ],
      },
      {
        title: 'Work place hygiene',
        items: [
          { id: 7, text: 'Raw and cooked foods separated', reasonGroup: 'FOOD' },
          { id: 8, text: 'Exhaust filters washed properly', reasonGroup: 'CLEANING' },
          { id: 9, text: 'Fly killer working properly', reasonGroup: 'EQUIPMENT' },
          { id: 10, text: 'Kitchen walls and ceilings are clean', reasonGroup: 'CLEANING' },
          { id: 11, text: 'Garbage bin covered and cleared', reasonGroup: 'CLEANING' },
          { id: 12, text: 'Hand wash working properly', reasonGroup: 'EQUIPMENT' },
          { id: 13, text: 'Floor cleaned during operation', reasonGroup: 'CLEANING' },
          { id: 14, text: 'Chemicals stored away from food', reasonGroup: 'FOOD' },
        ],
      },
      {
        title: 'Food items checking points',
        items: [
          { id: 15, text: 'Dry food items stored and stacked properly', reasonGroup: 'FOOD' },
          { id: 16, text: 'No insect activity observed', reasonGroup: 'PEST' },
          { id: 17, text: 'Storage items stacked properly (masala etc.)', reasonGroup: 'FOOD' },
          { id: 18, text: 'Frozen items stored according to standard as briefed', reasonGroup: 'FOOD' },
          { id: 19, text: 'Bain-marie working properly, food covered', reasonGroup: 'EQUIPMENT' },
          { id: 20, text: 'Snack counter cleaned, food items stored properly', reasonGroup: 'CLEANING' },
          { id: 21, text: 'No expired food in stock', reasonGroup: 'FOOD' },
          { id: 22, text: 'Chiller temperature sheet filled on time', reasonGroup: 'RECORDS' },
          { id: 23, text: 'Chillers cleaned outside and inside', reasonGroup: 'CLEANING' },
          { id: 24, text: 'Cylinder area cleaned and cleared', reasonGroup: 'CLEANING' },
          { id: 25, text: 'Outside area cleared', reasonGroup: 'CLEANING' },
        ],
      },
      {
        title: 'Safety and labeling',
        items: [
          { id: 26, text: 'Fire extinguisher inspection current and available', reasonGroup: 'SAFETY' },
          { id: 27, text: 'Food properly labeled and dated', reasonGroup: 'FOOD' },
        ],
      },
    ],
  },
  frontofhouse: {
    key: 'frontofhouse',
    label: 'Front of house checklist',
    sections: [
      {
        title: 'General area',
        items: [
          { id: 1, text: 'Entrance area clean and welcoming', reasonGroup: 'CLEANING' },
          { id: 2, text: 'Floors clean and free from spills', reasonGroup: 'CLEANING' },
          { id: 3, text: 'Tables sanitized, chairs clean and in good condition', reasonGroup: 'CLEANING' },
          { id: 4, text: 'Menu cards clean and updated', reasonGroup: 'SUPPLY' },
          { id: 5, text: 'Gloves worn while serving food', reasonGroup: 'STAFF' },
          { id: 6, text: 'Air conditioning and lighting functioning properly', reasonGroup: 'EQUIPMENT' },
        ],
      },
      {
        title: 'Hygiene and pest control',
        items: [
          { id: 7, text: 'Hand sanitizer available for guests', reasonGroup: 'SUPPLY' },
          { id: 8, text: 'Glass and windows are clean', reasonGroup: 'CLEANING' },
          { id: 9, text: 'Fly killer working properly', reasonGroup: 'EQUIPMENT' },
          { id: 10, text: 'No pest activity observed', reasonGroup: 'PEST' },
          { id: 11, text: 'Staff appearance neat and hygienic', reasonGroup: 'STAFF' },
          { id: 12, text: 'Hand wash working properly', reasonGroup: 'EQUIPMENT' },
          { id: 13, text: 'Serving counters clean and organized', reasonGroup: 'CLEANING' },
          { id: 14, text: 'CCTV cameras functioning properly', reasonGroup: 'EQUIPMENT' },
        ],
      },
      {
        title: 'Service checking points',
        items: [
          { id: 15, text: 'Guest complaint register available', reasonGroup: 'RECORDS' },
          { id: 16, text: 'Temperature in dining area comfortable', reasonGroup: 'EQUIPMENT' },
          { id: 17, text: 'Signboards visible, readable and clean', reasonGroup: 'CLEANING' },
          { id: 18, text: 'Pastry shop area clean, no unauthorized person present', reasonGroup: 'CLEANING' },
          { id: 19, text: 'Cash counter shelves clean and well organized', reasonGroup: 'CLEANING' },
          { id: 20, text: 'Outdoor area floor clean and organized', reasonGroup: 'CLEANING' },
          { id: 21, text: 'No expired food in stock', reasonGroup: 'FOOD' },
          { id: 22, text: 'Chiller temperature sheet filled on time', reasonGroup: 'RECORDS' },
          { id: 23, text: 'Sweet counter cleaned, items displayed properly', reasonGroup: 'CLEANING' },
          { id: 24, text: 'Cylinder area cleaned and cleared', reasonGroup: 'CLEANING' },
          { id: 25, text: 'Outside area cleared', reasonGroup: 'CLEANING' },
        ],
      },
      {
        title: 'Safety and labeling',
        items: [
          { id: 26, text: 'Fire extinguisher inspection current and available', reasonGroup: 'SAFETY' },
          { id: 27, text: 'Food properly labeled and dated', reasonGroup: 'FOOD' },
        ],
      },
    ],
  },
};
