export function parseList(content: string): string[] {
  const domains = new Set<string>();
  const len = content.length;
  let start = 0;

  while (start < len) {
    let end = content.indexOf('\n', start);
    if (end === -1) {
      end = len;
    }

    let line = content.substring(start, end).trim();
    start = end + 1;

    if (!line || line.startsWith('!') || line.startsWith('#') || line.startsWith('@@')) {
      continue;
    }

    // AdGuard 格式 (如: ||example.com^$all)
    if (line.startsWith('||')) {
      let domain = line.substring(2);
      const caretIdx = domain.indexOf('^');
      if (caretIdx !== -1) {
        domain = domain.substring(0, caretIdx);
      }
      const dollarIdx = domain.indexOf('$');
      if (dollarIdx !== -1) {
        domain = domain.substring(0, dollarIdx);
      }
      
      domain = domain.trim().toLowerCase();
      if (domain) domains.add(domain);
      continue;
    }

    // Hosts 格式 (如: 127.0.0.1 example.com)
    // 快速通道：如果没有空格/制表符，说明就是一个单纯的域名，直接添加以避免 split/RegExp 开销
    const hasSpace = line.includes(' ') || line.includes('\t');
    if (!hasSpace) {
      const domain = line.toLowerCase();
      domains.add(domain);
    } else {
      const parts = line.split(/\s+/);
      if (parts.length >= 2) {
        const isIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(parts[0]) || parts[0].includes(':');
        if (isIp) {
          const domain = parts[1].toLowerCase();
          if (domain && domain !== 'localhost' && domain !== '0.0.0.0' && domain !== '127.0.0.1') {
            domains.add(domain);
          }
        } else {
          const domain = parts[0].toLowerCase();
          if (domain) domains.add(domain);
        }
      } else if (parts.length === 1) {
        const domain = parts[0].toLowerCase();
        if (domain) domains.add(domain);
      }
    }
  }

  return Array.from(domains);
}
