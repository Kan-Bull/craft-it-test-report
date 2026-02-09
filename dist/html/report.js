// Craft Test Report - Client-side JavaScript

(function() {
  'use strict';

  // State
  let currentComments = {};
  let chart = null;
  let activeTab = 'E2E';

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', init);

  function getTabTests() {
    return REPORT_DATA.tests.filter(test => {
      const suite = (test.metadata.suite || '').toUpperCase();
      if (activeTab === 'ATOMICS') {
        return suite === 'ATOMICS';
      }
      // E2E tab includes E2E tests AND any unclassified tests
      return suite !== 'ATOMICS';
    });
  }

  function init() {
    if (!REPORT_DATA) {
      console.error('No report data found');
      return;
    }

    // Load comments from report data
    currentComments = { ...REPORT_DATA.comments };

    // Set timestamp (report-level, not tab-level)
    const timestamp = new Date(REPORT_DATA.timestamp).toLocaleString();
    document.getElementById('report-timestamp').textContent = timestamp;
    document.getElementById('footer-timestamp').textContent = timestamp;

    // Update tab counts
    updateTabCounts();

    // Render UI for active tab
    const tabTests = getTabTests();
    updateSummary(tabTests);
    initChart(tabTests);
    populateEpicFilter(tabTests);
    renderTests(tabTests);

    // Setup event listeners
    setupEventListeners();
  }

  function updateSummary(tests) {
    const passed = tests.filter(t => t.status === 'passed').length;
    const failed = tests.filter(t => t.status === 'failed' || t.status === 'timedOut').length;
    const skipped = tests.filter(t => t.status === 'skipped').length;
    const duration = tests.reduce((sum, t) => sum + t.duration, 0);

    document.getElementById('total-count').textContent = tests.length;
    document.getElementById('passed-count').textContent = passed;
    document.getElementById('failed-count').textContent = failed;
    document.getElementById('skipped-count').textContent = skipped;
    document.getElementById('duration-value').textContent = formatDuration(duration);
  }

  function initChart(tests) {
    const ctx = document.getElementById('results-chart');
    if (!ctx) return;

    const passed = tests.filter(t => t.status === 'passed').length;
    const failed = tests.filter(t => t.status === 'failed' || t.status === 'timedOut').length;
    const skipped = tests.filter(t => t.status === 'skipped').length;

    chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Passed', 'Failed', 'Skipped'],
        datasets: [{
          data: [passed, failed, skipped],
          backgroundColor: ['#10b981', '#ef4444', '#f59e0b'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '55%',
        layout: {
          padding: {
            bottom: 10
          }
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 12,
              usePointStyle: true,
              pointStyle: 'circle',
              font: {
                size: 12
              }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                const percentage = ((context.raw / total) * 100).toFixed(1);
                return `${context.label}: ${context.raw} (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  }

  function updateChart(tests) {
    if (!chart) return;
    const passed = tests.filter(t => t.status === 'passed').length;
    const failed = tests.filter(t => t.status === 'failed' || t.status === 'timedOut').length;
    const skipped = tests.filter(t => t.status === 'skipped').length;
    chart.data.datasets[0].data = [passed, failed, skipped];
    chart.update('none');
  }

  function updateTabCounts() {
    const e2eCount = REPORT_DATA.tests.filter(t => {
      const suite = (t.metadata.suite || '').toUpperCase();
      return suite !== 'ATOMICS';
    }).length;
    const atomicsCount = REPORT_DATA.tests.filter(t => {
      const suite = (t.metadata.suite || '').toUpperCase();
      return suite === 'ATOMICS';
    }).length;

    document.querySelector('[data-tab="E2E"]').innerHTML =
      'E2E <span class="tab-count">(' + e2eCount + ')</span>';
    document.querySelector('[data-tab="ATOMICS"]').innerHTML =
      'Atomics <span class="tab-count">(' + atomicsCount + ')</span>';
  }

  function switchTab(tab) {
    activeTab = tab;

    // Update tab button active state
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    // Reset filters
    const search = document.getElementById('search');
    if (search) search.value = '';
    const statusFilter = document.getElementById('status-filter');
    if (statusFilter) statusFilter.value = 'all';
    const severityFilter = document.getElementById('severity-filter');
    if (severityFilter) severityFilter.value = 'all';

    // Refresh view
    const tabTests = getTabTests();
    updateSummary(tabTests);
    updateChart(tabTests);
    populateEpicFilter(tabTests);
    renderTests(tabTests);
  }

  function populateEpicFilter(tests) {
    const epics = new Set();
    tests.forEach(test => {
      if (test.metadata.epic) {
        epics.add(test.metadata.epic);
      }
    });

    const select = document.getElementById('epic-filter');
    // Clear existing options except "All Epics"
    while (select.options.length > 1) {
      select.remove(1);
    }
    select.value = 'all';

    epics.forEach(epic => {
      const option = document.createElement('option');
      option.value = epic;
      option.textContent = epic;
      select.appendChild(option);
    });
  }

  function buildTestRowsHTML(tests) {
    return tests.map(test => {
      const testFileId = getTestFileId(test.filePath);
      const cleanErrorTrace = stripAnsiCodes(test.errorTrace || '');
      const retryBadge = test.retries > 0 ? `<span class="retry-badge">↻ ${test.retries} ${test.retries === 1 ? 'retry' : 'retries'}</span>` : '';

      return `
      <tr class="test-row" data-test-id="${escapeHtml(test.testId)}">
        <td>
          <span class="status-badge status-${test.status}">${test.status}</span>${retryBadge}
        </td>
        <td>
          <div class="test-name">${escapeHtml(test.name)}</div>
          <div class="test-id">${escapeHtml(testFileId)}</div>
        </td>
        <td>
          ${test.metadata.description ? escapeHtml(test.metadata.description) : '<span style="color: #94a3b8;">-</span>'}
        </td>
        <td>
          <div class="metadata-tags">
            ${renderMetadataTags(test.metadata)}
          </div>
        </td>
        <td>${formatDuration(test.duration)}</td>
        <td class="error-cell">
          ${cleanErrorTrace ? `
            <div class="error-content" style="display: none;">
              <pre>${escapeHtml(cleanErrorTrace)}</pre>
            </div>
            <span class="error-toggle" onclick="toggleError(this)">Show error</span>
          ` : '<span style="color: #94a3b8;">-</span>'}
        </td>
        <td class="comment-cell">
          <textarea
            class="comment-field"
            data-test-id="${escapeHtml(test.testId)}"
            placeholder="Add interpretation or notes..."
          >${escapeHtml(currentComments[test.testId] || '')}</textarea>
        </td>
      </tr>
    `}).join('');
  }

  function renderTests(tests) {
    const tbody = document.getElementById('tests-body');
    if (!tbody) return;
    tbody.innerHTML = buildTestRowsHTML(tests);

    // Add change listeners to comment fields
    tbody.querySelectorAll('.comment-field').forEach(field => {
      field.addEventListener('change', handleCommentChange);
      field.addEventListener('input', handleCommentChange);
    });
  }

  function renderMetadataTags(metadata) {
    const tags = [];

    if (metadata.severity) {
      tags.push(`<span class="metadata-tag severity-${metadata.severity}">${metadata.severity}</span>`);
    }
    if (metadata.owner) {
      tags.push(`<span class="metadata-tag owner">@${escapeHtml(metadata.owner)}</span>`);
    }
    if (metadata.epic) {
      tags.push(`<span class="metadata-tag">${escapeHtml(metadata.epic)}</span>`);
    }
    if (metadata.feature) {
      tags.push(`<span class="metadata-tag">${escapeHtml(metadata.feature)}</span>`);
    }
    if (metadata.tags && metadata.tags.length > 0) {
      metadata.tags.forEach(tag => {
        tags.push(`<span class="metadata-tag">${escapeHtml(tag)}</span>`);
      });
    }

    return tags.join('') || '<span style="color: #94a3b8;">-</span>';
  }

  function setupEventListeners() {
    // Search
    const searchInput = document.getElementById('search');
    if (searchInput) {
      searchInput.addEventListener('input', debounce(filterTests, 200));
    }

    // Status filter
    const statusFilter = document.getElementById('status-filter');
    if (statusFilter) {
      statusFilter.addEventListener('change', filterTests);
    }

    // Severity filter
    const severityFilter = document.getElementById('severity-filter');
    if (severityFilter) {
      severityFilter.addEventListener('change', filterTests);
    }

    // Epic filter
    const epicFilter = document.getElementById('epic-filter');
    if (epicFilter) {
      epicFilter.addEventListener('change', filterTests);
    }

    // Export PDF
    const exportBtn = document.getElementById('export-pdf');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportPDF);
    }

    // Tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });
  }

  function filterTests() {
    const searchTerm = (document.getElementById('search')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('status-filter')?.value || 'all';
    const severityFilter = document.getElementById('severity-filter')?.value || 'all';
    const epicFilter = document.getElementById('epic-filter')?.value || 'all';

    const filtered = getTabTests().filter(test => {
      // Search match
      const searchMatch = !searchTerm ||
        test.name.toLowerCase().includes(searchTerm) ||
        test.testId.toLowerCase().includes(searchTerm) ||
        (test.metadata.description || '').toLowerCase().includes(searchTerm);

      // Status match
      const statusMatch = statusFilter === 'all' || test.status === statusFilter;

      // Severity match
      const severityMatch = severityFilter === 'all' || test.metadata.severity === severityFilter;

      // Epic match
      const epicMatch = epicFilter === 'all' || test.metadata.epic === epicFilter;

      return searchMatch && statusMatch && severityMatch && epicMatch;
    });

    renderTests(filtered);
  }

  function handleCommentChange(event) {
    const testId = event.target.dataset.testId;
    const value = event.target.value.trim();

    if (value) {
      currentComments[testId] = value;
    } else {
      delete currentComments[testId];
    }
  }

  function exportPDF() {
    // Save current state
    const savedTab = activeTab;
    const savedSearch = document.getElementById('search')?.value || '';
    const savedStatus = document.getElementById('status-filter')?.value || 'all';
    const savedSeverity = document.getElementById('severity-filter')?.value || 'all';
    const savedEpic = document.getElementById('epic-filter')?.value || 'all';

    // Compute test subsets (ignore filters - PDF shows all tests)
    const allTests = REPORT_DATA.tests;
    const e2eTests = allTests.filter(t => (t.metadata.suite || '').toUpperCase() !== 'ATOMICS');
    const atomicsTests = allTests.filter(t => (t.metadata.suite || '').toUpperCase() === 'ATOMICS');
    const hasBothSections = e2eTests.length > 0 && atomicsTests.length > 0;

    // Update summary and chart to global (all tests)
    updateSummary(allTests);
    updateChart(allTests);

    // Render E2E tests into the primary table
    document.getElementById('tests-body').innerHTML = buildTestRowsHTML(e2eTests);

    // Show section headings only when both sections have tests
    if (hasBothSections) {
      document.body.classList.add('show-section-headings');
    }

    // Render Atomics section if there are atomics tests
    const atomicsSection = document.getElementById('print-atomics-section');
    const atomicsBody = document.getElementById('print-atomics-body');
    if (atomicsTests.length > 0 && atomicsBody && atomicsSection) {
      atomicsBody.innerHTML = buildTestRowsHTML(atomicsTests);
      atomicsSection.classList.add('print-active');
    }

    // Expand all errors and mark empty comments (both tables)
    document.querySelectorAll('.error-content').forEach(el => {
      el.style.display = 'block';
    });
    document.querySelectorAll('.error-toggle').forEach(el => {
      el.style.display = 'none';
    });
    document.querySelectorAll('.comment-field').forEach(field => {
      if (!field.value.trim()) {
        field.classList.add('empty-comment');
      } else {
        field.classList.remove('empty-comment');
      }
    });

    // Restore function
    function restore() {
      // Restore active tab state
      activeTab = savedTab;

      // Re-render active tab's tests (also re-attaches comment listeners)
      const tabTests = getTabTests();
      renderTests(tabTests);
      updateSummary(tabTests);
      updateChart(tabTests);

      // Clear and hide the print-only Atomics section
      if (atomicsBody) atomicsBody.innerHTML = '';
      if (atomicsSection) atomicsSection.classList.remove('print-active');

      // Remove show-section-headings class
      document.body.classList.remove('show-section-headings');

      // Restore error toggles
      document.querySelectorAll('.error-content').forEach(el => {
        el.style.display = 'none';
      });
      document.querySelectorAll('.error-toggle').forEach(el => {
        el.style.display = 'inline';
        el.textContent = 'Show error';
      });

      // Remove empty-comment class
      document.querySelectorAll('.comment-field').forEach(field => {
        field.classList.remove('empty-comment');
      });

      // Restore filters
      const search = document.getElementById('search');
      if (search) search.value = savedSearch;
      const statusFilter = document.getElementById('status-filter');
      if (statusFilter) statusFilter.value = savedStatus;
      const severityFilter = document.getElementById('severity-filter');
      if (severityFilter) severityFilter.value = savedSeverity;
      const epicFilter = document.getElementById('epic-filter');
      if (epicFilter) epicFilter.value = savedEpic;

      // If filters were active, re-apply them
      if (savedSearch || savedStatus !== 'all' || savedSeverity !== 'all' || savedEpic !== 'all') {
        filterTests();
      }
    }

    // Use afterprint event for reliable restore
    window.addEventListener('afterprint', function onAfterPrint() {
      window.removeEventListener('afterprint', onAfterPrint);
      restore();
    });

    // Trigger print dialog
    window.print();
  }

  // Utility functions
  function getTestFileId(filePath) {
    if (!filePath) return '';
    // Extract filename and remove .spec.ts/.spec.js/.test.ts/.test.js
    const fileName = filePath.split('/').pop() || '';
    return fileName.replace(/\.(spec|test)\.(ts|js)$/, '');
  }

  function stripAnsiCodes(text) {
    if (!text) return '';
    // Remove ANSI escape codes for cleaner display
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }

  function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }

  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  function showNotification(message, isError = false) {
    // Simple notification
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 24px;
      background: ${isError ? '#fee2e2' : '#d1fae5'};
      color: ${isError ? '#dc2626' : '#059669'};
      border-radius: 8px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
      animation: slideIn 0.3s ease;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  // Global function for error toggle
  window.toggleError = function(element) {
    const content = element.previousElementSibling;
    if (content.style.display === 'none') {
      content.style.display = 'block';
      element.textContent = 'Hide error';
    } else {
      content.style.display = 'none';
      element.textContent = 'Show error';
    }
  };

  // Add CSS animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    @keyframes slideOut {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(style);
})();
