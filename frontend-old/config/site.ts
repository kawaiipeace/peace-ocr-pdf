export type SiteConfig = typeof siteConfig;

export interface NavMenuItems {
  href: string;
  label: string;
}

export interface NavItems {
  href: string;
  label: string;
}

export const siteConfig = {
  name: "OCR Conversion - PEA",
  description: "Proudly Presented by PEACE",
  navItems: [    
    {
      label: "หน้าหลัก",
      href: "/",
    },
    {
      label: "Docs",
      href: "/docs",
    },
    {
      label: "Pricing",
      href: "/pricing",
    },
    {
      label: "Blog",
      href: "/blog",
    },
    {
      label: "About",
      href: "/about",
    },
  ] as NavItems[],
  navMenuItems: [
    
    {
      label: "Profile",
      href: "/profile",
    },
    {
      label: "Dashboard",
      href: "/dashboard",
    },
    {
      label: "Projects",
      href: "/projects",
    },
    {
      label: "Team",
      href: "/team",
    },
    {
      label: "Calendar",
      href: "/calendar",
    },
    {
      label: "Settings",
      href: "/settings",
    },
    {
      label: "Help & Feedback",
      href: "/help-feedback",
    },
    {
      label: "Logout",
      href: "/logout",
    },
    
  ] as NavMenuItems[],
  links: {
    github: "https://github.com/kawaiipeace/peace-ocr-pdf",
  },
};
