const fs = require('fs');
let content = fs.readFileSync('views/admin/home_builder.ejs', 'utf8');

const announcementForm = `
          <hr style="margin: 40px 0; border: none; border-top: 1px solid var(--ink-200);">
          <h2><span class="step-num"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></span> Announcement Bar</h2>
          <div class="field" style="margin-top: 24px;">
            <label class="label">Show Announcement Bar</label>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" name="show_announcement" value="true" <%= settings.show_announcement === 'true' ? 'checked' : '' %>>
              Enable the top announcement bar
            </label>
          </div>
          <div class="field" style="margin-top: 16px;">
            <label class="label">Announcement Text</label>
            <input class="input" name="announcement_text" value="<%= settings.announcement_text || 'Free shipping on orders over ₹500!' %>">
          </div>
          <div class="field" style="margin-top: 16px;">
            <label class="label">Announcement Link (Optional)</label>
            <input class="input" name="announcement_link" value="<%= settings.announcement_link || '/shop' %>">
          </div>
`;

content = content.replace('<!-- Theme & Design Settings -->', ''); // Just to be sure
content = content.replace('<div class="row" style="margin-top: 40px; justify-content: flex-end;">', announcementForm + '\n<div class="row" style="margin-top: 40px; justify-content: flex-end;">');

fs.writeFileSync('views/admin/home_builder.ejs', content);
console.log('Added announcement bar settings');
