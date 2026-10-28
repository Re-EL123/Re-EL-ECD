function app() {
    return {
        authenticated: false,
        currentRoute: '/app/overview',
        user: { name: 'Admin User', email: 'admin@example.com' },
        loginForm: { email: '', password: '' },
        
        init() {
            // Check auth
            this.setupRouting();
            // Listen for hash changes
            window.addEventListener('hashchange', () => {
                this.setupRouting();
            });
        },
        
        setupRouting() {
            const hash = window.location.hash || '#/app/overview';
            this.currentRoute = hash.substring(1);
        },
        
        login() {
            // Simple demo login
            if (this.loginForm.email && this.loginForm.password) {
                this.authenticated = true;
                window.location.hash = '#/app/overview';
                this.setupRouting();
                setTimeout(() => {
                    if (typeof lucide !== 'undefined') {
                        lucide.createIcons();
                    }
                }, 100);
            }
        },
        
        logout() {
            this.authenticated = false;
            window.location.hash = '#/login';
        },
        
        getPageTitle() {
            const titles = {
                '/app/overview': 'Dashboard',
                '/app/learners': 'Learners',
                '/app/attendance': 'Attendance',
                '/app/curriculum': 'Curriculum',
                '/app/staff': 'Staff',
                '/app/finance': 'Finance',
                '/app/parents': 'Parents',
                '/app/settings': 'Settings'
            };
            return titles[this.currentRoute] || 'Re-EL ECD';
        },
        
        toggleTheme() {
            const html = document.documentElement;
            const current = html.getAttribute('data-theme');
            html.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
        }
    }
}
