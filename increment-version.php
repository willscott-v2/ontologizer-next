#!/usr/bin/env php
<?php
/**
 * Ontologizer Version Incrementing Script
 * 
 * Usage:
 * php increment-version.php patch   # 1.7.2 -> 1.7.3
 * php increment-version.php minor   # 1.7.2 -> 1.8.0
 * php increment-version.php major   # 1.7.2 -> 2.0.0
 */

function increment_version($current_version, $type = 'patch') {
    $parts = explode('.', $current_version);
    $major = intval($parts[0]);
    $minor = intval($parts[1]);
    $patch = intval($parts[2]);
    
    switch ($type) {
        case 'major':
            $major++;
            $minor = 0;
            $patch = 0;
            break;
        case 'minor':
            $minor++;
            $patch = 0;
            break;
        case 'patch':
        default:
            $patch++;
            break;
    }
    
    return "{$major}.{$minor}.{$patch}";
}

function update_version_in_file($file_path, $old_version, $new_version) {
    $content = file_get_contents($file_path);
    
    // Update plugin header version
    $content = preg_replace(
        '/(\* Version:\s+)' . preg_quote($old_version, '/') . '/',
        '${1}' . $new_version,
        $content
    );
    
    // Update version constant
    $content = preg_replace(
        '/(define\(\s*[\'"]ONTOLOGIZER_VERSION[\'"]\s*,\s*[\'"])' . preg_quote($old_version, '/') . '([\'"].*?\);)/',
        '${1}' . $new_version . '${2}',
        $content
    );
    
    return file_put_contents($file_path, $content);
}

function update_changelog($file_path, $old_version, $new_version) {
    $content = file_get_contents($file_path);
    $date = date('Y-m-d');
    
    // Update the version number in the latest entry
    $content = preg_replace(
        '/^## \[' . preg_quote($old_version, '/') . '\] - \d{4}-\d{2}-\d{2}/m',
        "## [{$new_version}] - {$date}",
        $content
    );
    
    return file_put_contents($file_path, $content);
}

// Get command line arguments
$type = isset($argv[1]) ? $argv[1] : 'patch';

if (!in_array($type, ['patch', 'minor', 'major'])) {
    echo "Error: Invalid increment type. Use 'patch', 'minor', or 'major'\n";
    exit(1);
}

// Read current version from ontologizer.php
$plugin_file = __DIR__ . '/ontologizer.php';
if (!file_exists($plugin_file)) {
    echo "Error: ontologizer.php not found in current directory\n";
    exit(1);
}

$content = file_get_contents($plugin_file);
if (preg_match('/define\(\s*[\'"]ONTOLOGIZER_VERSION[\'"]\s*,\s*[\'"]([0-9\.]+)[\'"]/', $content, $matches)) {
    $current_version = $matches[1];
} else {
    echo "Error: Could not find ONTOLOGIZER_VERSION constant\n";
    exit(1);
}

$new_version = increment_version($current_version, $type);

echo "Incrementing version from {$current_version} to {$new_version} ({$type})\n";

// Update ontologizer.php
if (update_version_in_file($plugin_file, $current_version, $new_version)) {
    echo "✓ Updated ontologizer.php\n";
} else {
    echo "✗ Failed to update ontologizer.php\n";
    exit(1);
}

// Update CHANGELOG.md
$changelog_file = __DIR__ . '/CHANGELOG.md';
if (file_exists($changelog_file)) {
    if (update_changelog($changelog_file, $current_version, $new_version)) {
        echo "✓ Updated CHANGELOG.md\n";
    } else {
        echo "✗ Failed to update CHANGELOG.md\n";
    }
}

echo "\nVersion updated successfully! Don't forget to:\n";
echo "1. Update the CHANGELOG.md with your changes\n";
echo "2. Run: rm -f ontologizer.zip && zip -r ontologizer.zip ontologizer.php includes/ assets/ templates/ README.md LICENSE CHANGELOG.md ROADMAP.md install.php\n";
echo "3. Test the updated plugin\n";
echo "4. Commit your changes\n"; 