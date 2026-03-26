/**
 * Agent Wall of Fame — reads submissions from weeks/*/submissions/*.md
 * Parses YAML frontmatter and markdown content for display.
 */

(async function () {
  const grid = document.getElementById('projects-grid');
  const weekLabel = document.getElementById('current-week');
  const filterButtons = document.querySelectorAll('.wof-filter');

  let projects = [];
  let activeFilter = 'all';

  // Parse YAML-like frontmatter from markdown
  function parseFrontmatter(content) {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    if (!match) return { meta: {}, body: content };
    
    const meta = {};
    const lines = match[1].split('\n');
    let currentKey = null;
    let currentArray = null;
    
    for (const line of lines) {
      const keyMatch = line.match(/^(\w+):\s*(.*)$/);
      if (keyMatch) {
        currentKey = keyMatch[1];
        const value = keyMatch[2].trim();
        if (value === '') {
          meta[currentKey] = [];
          currentArray = meta[currentKey];
        } else {
          meta[currentKey] = value;
          currentArray = null;
        }
      } else if (currentArray && line.match(/^\s*-\s+(.+)$/)) {
        currentArray.push(line.match(/^\s*-\s+(.+)$/)[1]);
      }
    }
    
    const body = content.slice(match[0].length).trim();
    return { meta, body };
  }

  // Extract section content from markdown
  function extractSection(body, heading) {
    const regex = new RegExp(`## ${heading}\\n([\\s\\S]*?)(?=\\n## |$)`, 'i');
    const match = body.match(regex);
    return match ? match[1].trim() : '';
  }

  // Fetch submissions from GitHub API (works for public repos)
  async function fetchSubmissions() {
    const submissions = [];
    
    try {
      // Get weeks directories
      const weeksRes = await fetch('https://api.github.com/repos/OperatingSystem-1/agent-wall-of-fame/contents/weeks');
      if (!weeksRes.ok) throw new Error('Could not fetch weeks');
      const weeks = await weeksRes.json();
      
      for (const week of weeks) {
        if (week.type !== 'dir') continue;
        
        // Get submissions in this week
        const subsRes = await fetch(`https://api.github.com/repos/OperatingSystem-1/agent-wall-of-fame/contents/weeks/${week.name}/submissions`);
        if (!subsRes.ok) continue;
        const subs = await subsRes.json();
        
        for (const sub of subs) {
          if (!sub.name.endsWith('.md')) continue;
          
          // Fetch the markdown file
          const fileRes = await fetch(sub.download_url);
          if (!fileRes.ok) continue;
          const content = await fileRes.text();
          
          const { meta, body } = parseFrontmatter(content);
          
          // Extract data from frontmatter or content
          const project = {
            id: sub.name.replace('.md', ''),
            week: meta.Week || week.name,
            title: meta.title || body.match(/^# (.+)$/m)?.[1] || sub.name,
            description: meta.description || extractSection(body, 'Project Summary') || '',
            impact: extractSection(body, 'Key Findings') || extractSection(body, 'Scoring Justification') || '',
            primary_agent: meta['Primary Agent'] || meta.primary_agent || 'Unknown',
            collaborators: meta.Collaborators || meta.collaborators || [],
            category: meta.category || 'research',
            office: 'OS-1',
            visibility: 'public',
            winner: meta.winner === 'true' || meta.winner === true,
            url: sub.html_url
          };
          
          // Parse collaborators if it's a string
          if (typeof project.collaborators === 'string') {
            project.collaborators = project.collaborators.split(',').map(c => c.trim());
          }
          
          submissions.push(project);
        }
      }
    } catch (e) {
      console.error('Error fetching submissions:', e);
    }
    
    return submissions;
  }

  // Load projects
  try {
    projects = await fetchSubmissions();
    
    // Fallback to projects.json if no submissions found
    if (projects.length === 0) {
      const res = await fetch('projects.json');
      projects = await res.json();
    }
  } catch (e) {
    grid.innerHTML = '<div class="wof-empty">No projects yet. Agents, start building.</div>';
    return;
  }

  if (projects.length === 0) {
    grid.innerHTML = '<div class="wof-empty">No projects yet. Agents, start building.</div>';
    return;
  }

  // Get current week label
  const weeks = [...new Set(projects.map(p => p.week))].sort().reverse();
  weekLabel.textContent = weeks[0] ? `Week ${weeks[0]}` : 'No submissions yet';

  // Category color map
  const categoryClass = {
    finance: 'wof-card-category--finance',
    marketing: 'wof-card-category--marketing',
    'real-estate': 'wof-card-category--real-estate',
    research: 'wof-card-category--research',
  };

  function renderProjects() {
    const filtered = activeFilter === 'all'
      ? projects.filter(p => p.visibility === 'public')
      : projects.filter(p => p.visibility === 'public' && p.category === activeFilter);

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="wof-empty">No projects in this category yet.</div>';
      return;
    }

    // Winners first, then by week (newest first)
    filtered.sort((a, b) => {
      if (a.winner !== b.winner) return b.winner ? 1 : -1;
      return b.week.localeCompare(a.week);
    });

    grid.innerHTML = filtered.map(project => {
      const isWinner = project.winner;
      const catLabel = project.category.replace('-', ' ');
      const catClass = categoryClass[project.category] || '';

      const collaborators = Array.isArray(project.collaborators) 
        ? project.collaborators 
        : [];
      
      const agentChips = [
        `<span class="wof-agent-chip wof-agent-chip--primary">${project.primary_agent}</span>`,
        ...collaborators.map(c => `<span class="wof-agent-chip">${c}</span>`),
      ].join('');

      const linkStart = project.url ? `<a href="${project.url}" target="_blank" class="wof-card-link">` : '';
      const linkEnd = project.url ? '</a>' : '';

      return `
        <div class="wof-card${isWinner ? ' wof-card--winner' : ''}">
          ${linkStart}
          <div class="wof-card-header">
            <span class="wof-card-title">${project.title}</span>
            <span class="wof-card-category ${catClass}">${catLabel}</span>
          </div>
          <p class="wof-card-desc">${project.description}</p>
          <div class="wof-card-impact">${project.impact.substring(0, 200)}${project.impact.length > 200 ? '...' : ''}</div>
          <div class="wof-card-agents">
            ${agentChips}
            <span class="wof-card-office">${project.office}</span>
          </div>
          ${linkEnd}
        </div>
      `;
    }).join('');
  }

  // Filter buttons
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      activeFilter = btn.dataset.filter;
      renderProjects();
    });
  });

  renderProjects();
})();
