const fs = require('fs');

const appearance = fs.readFileSync('views/admin/appearance.ejs', 'utf8');

// The Theme & Design Settings starts at <!-- Theme & Design Settings -->
// Oh wait, there are no comments. It's `<h2 style="font-size: 18px; margin-bottom: 20px;">Theme & Design Settings</h2>`.

const splitRegex = /(<hr style="margin: 40px 0; border-top: 1px solid var\(--ink-100\);">\s*<h2 style="font-size: 18px; margin-bottom: 20px;">Theme & Design Settings<\/h2>)/;
const parts = appearance.split(splitRegex);

// parts[0] is everything before Theme & Design Settings.
// parts[1] is the Theme & Design Settings hr+h2.
// parts[2] is everything after.

// -----------------------------------------
// Build home_builder.ejs
// -----------------------------------------
let homeBuilder = parts[0].replace(/adminSection = 'appearance';/, "adminSection = 'home_builder';")
  .replace(/<h1[^>]*>Site Appearance<\/h1>/, '<h1 style="font-size:28px;margin-bottom:4px">Home Page Builder</h1>')
  .replace(/<p[^>]*>Manage the promotional banners.*/, '<p class="text-muted" style="margin:0">Manage the layout, sections, banners and content of the storefront home page.</p>');

// Add layout array editor
const layoutEditor = `
          <hr style="margin: 40px 0; border: none; border-top: 1px solid var(--ink-200);">
          <h2><span class="step-num"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg></span> Section Layout</h2>
          <p class="text-muted" style="font-size: 14px; margin-bottom: 24px;">Drag and drop to reorder the sections on the home page, or uncheck to hide them.</p>
          
          <input type="hidden" name="home_layout" id="home_layout_input">
          
          <div id="layout-builder" style="background: #fff; border: 1px solid var(--ink-200); border-radius: 8px; padding: 16px;">
            <% 
              let l = [];
              try { l = JSON.parse(settings.home_layout); } 
              catch(e) { l = ['hero', 'categories', 'promo1', 'bestsellers', 'trust', 'ad1', 'promo2', 'featured', 'ad2', 'promo3', 'toprated', 'newsletter']; }
              
              const sectionNames = {
                'hero': 'Hero Banner Image',
                'categories': 'Category Circles',
                'promo1': 'Promo Banner 1',
                'bestsellers': 'Best Sellers Slider',
                'trust': 'Trust Badges',
                'ad1': 'Custom Advertisement 1',
                'promo2': 'Promo Banner 2',
                'featured': 'Featured Products Grid',
                'ad2': 'Custom Advertisement 2',
                'promo3': 'Promo Banner 3',
                'toprated': 'Top Rated Products Grid',
                'newsletter': 'Newsletter Subscribe'
              };
              
              const allSections = Object.keys(sectionNames);
              const missingSections = allSections.filter(s => !l.includes(s));
              const fullLayout = [...l, ...missingSections];
            %>
            
            <% fullLayout.forEach((sec) => { %>
              <div class="layout-item" data-id="<%= sec %>" style="display: flex; align-items: center; padding: 12px; border: 1px solid var(--ink-100); margin-bottom: 8px; border-radius: 6px; background: #fafafa; cursor: grab;">
                <svg style="margin-right: 12px; color: var(--ink-300);" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h16M4 16h16"/></svg>
                <div style="flex-grow: 1; font-weight: 500;"><%= sectionNames[sec] %></div>
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                  Show
                  <input type="checkbox" name="show_<%= sec %>" value="true" <%= settings['show_'+sec] !== 'false' ? 'checked' : '' %>>
                </label>
              </div>
            <% }) %>
          </div>
          
          <script>
            // Simple drag and drop using SortableJS if available, otherwise manual
            // Let's just do a basic manual up/down for now or rely on native drag and drop
            const container = document.getElementById('layout-builder');
            let draggingItem = null;
            
            container.querySelectorAll('.layout-item').forEach(item => {
              item.draggable = true;
              item.addEventListener('dragstart', (e) => {
                draggingItem = item;
                setTimeout(() => item.style.opacity = '0.5', 0);
              });
              item.addEventListener('dragend', () => {
                setTimeout(() => {
                  draggingItem.style.opacity = '1';
                  draggingItem = null;
                  updateLayoutInput();
                }, 0);
              });
              item.addEventListener('dragover', (e) => e.preventDefault());
              item.addEventListener('dragenter', function(e) {
                e.preventDefault();
                if (this !== draggingItem) {
                  const allItems = [...container.querySelectorAll('.layout-item')];
                  const currentPos = allItems.indexOf(draggingItem);
                  const hoveredPos = allItems.indexOf(this);
                  if (currentPos < hoveredPos) {
                    this.after(draggingItem);
                  } else {
                    this.before(draggingItem);
                  }
                }
              });
            });
            
            function updateLayoutInput() {
              const layout = [...container.querySelectorAll('.layout-item')].map(el => el.getAttribute('data-id'));
              document.getElementById('home_layout_input').value = JSON.stringify(layout);
            }
            updateLayoutInput(); // Initial
            
            // Add a submit handler intercept to ensure unchecked checkboxes submit as "false"
            document.getElementById('appearance-form').addEventListener('submit', (e) => {
              container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                if (!cb.checked) {
                  const hidden = document.createElement('input');
                  hidden.type = 'hidden';
                  hidden.name = cb.name;
                  hidden.value = 'false';
                  e.target.appendChild(hidden);
                }
              });
            });
          </script>
`;

homeBuilder = homeBuilder.replace('<form id="appearance-form">', '<form id="appearance-form">' + layoutEditor);
// Also append the submit button and script at the end.
homeBuilder += `
          <div class="row" style="margin-top: 40px; justify-content: flex-end;">
            <button class="btn btn-primary btn-lg" type="submit">Save Home Page</button>
          </div>
        </form>
      </div>
    </div>
  </div>
</div>

<script>
document.getElementById('appearance-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  
  const formData = new FormData(e.target);
  
  try {
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      body: formData
    });
    
    if (res.ok) {
      alert('Home Page updated successfully!');
      window.location.reload();
    } else {
      alert('Failed to save settings');
    }
  } catch (err) {
    alert('An error occurred');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Home Page';
  }
});
</script>

<%- include('../partials/footer') %>
`;

fs.writeFileSync('views/admin/home_builder.ejs', homeBuilder);


// -----------------------------------------
// Rebuild appearance.ejs (keep only theme settings)
// -----------------------------------------
const appearanceHeader = parts[0]
  .replace(/<form id="appearance-form">[\s\S]*$/, '<form id="appearance-form">\n'); // Strip all the form fields
  
const newAppearance = appearanceHeader + parts[1] + parts[2];
fs.writeFileSync('views/admin/appearance.ejs', newAppearance);

console.log("Done");
