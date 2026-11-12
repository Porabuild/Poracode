//! Match `git remote -v`'s ordered, multi-valued URLs using libgit2 rewrites.

use git2::{Config, Error, ErrorCode, Repository};

pub(super) fn output(repo: &Repository, config: &Config) -> Result<String, Error> {
    let remotes = repo.remotes()?;
    let mut names = Vec::new();
    for name in remotes.iter() {
        if let Some(name) = name? {
            names.push(name);
        }
    }
    names.sort_unstable();
    let mut output = String::new();
    for name in names {
        let urls = read_urls(config, &format!("remote.{name}.url"))?;
        let explicit_push = read_urls(config, &format!("remote.{name}.pushurl"))?;
        let mut fetch = Vec::new();
        let mut push = Vec::new();
        for url in &urls {
            // Anonymous remotes apply insteadOf and pushInsteadOf in memory;
            // looking up a named remote would discard all but its last URL.
            let remote = repo.remote_anonymous(url)?;
            fetch.push(remote.url()?.to_owned());
            if explicit_push.is_empty()
                && let Some(url) = remote.pushurl()?
            {
                push.push(url.to_owned());
            }
        }
        for url in &explicit_push {
            // Explicit pushurl uses insteadOf, never pushInsteadOf.
            push.push(repo.remote_anonymous(url)?.url()?.to_owned());
        }
        if push.is_empty() {
            push.clone_from(&fetch);
        }
        if let Some(url) = fetch.first() {
            output.push_str(&format!("{name}\t{url} (fetch)"));
            match config.get_string(&format!("remote.{name}.partialclonefilter")) {
                Ok(filter) => output.push_str(&format!(" [{filter}]")),
                Err(error) if error.code() == ErrorCode::NotFound => {}
                Err(error) => return Err(error),
            }
            output.push('\n');
        } else {
            output.push_str(&format!("{name}\t\n"));
        }
        for url in push {
            output.push_str(&format!("{name}\t{url} (push)\n"));
        }
    }
    Ok(output)
}

fn read_urls(config: &Config, key: &str) -> Result<Vec<String>, Error> {
    let mut values = match config.multivar(key, None) {
        Ok(values) => values,
        Err(error) if error.code() == ErrorCode::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let mut output = Vec::new();
    while let Some(entry) = values.next() {
        let entry = entry?;
        if !entry.has_value() {
            return Err(Error::new(
                ErrorCode::Invalid,
                git2::ErrorClass::Config,
                "Remote URLs require a value",
            ));
        }
        let value = entry.value()?;
        if value.is_empty() {
            output.clear();
        } else {
            output.push(value.to_owned());
        }
    }
    Ok(output)
}
