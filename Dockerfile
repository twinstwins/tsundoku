FROM ruby:2.5.1

RUN apt-get update && apt-get install -y nodejs --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN apt-get update && apt-get install -y mysql-client --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN apt-get update -qq && apt-get install -y build-essential libpq-dev nodejs
RUN curl -sL https://deb.nodesource.com/setup_10.x | bash - \
        && apt-get install -y nodejs
# Docker内部でworkdirをどこに置くか、どういう名前にするかを決める記述
RUN mkdir /workdir
WORKDIR /workdir

# Docker内部でGemfile、Gemfile.lockをどこに配置するかを決める記述
ADD Gemfile /workdir/Gemfile
ADD Gemfile.lock /workdir/Gemfile.lock

# 注意！！ Gemfile.lockにかいてあるbundlerバージョンが2.0.1以降だとエラーが出ます！
# 僕の場合はここで環境設定してあげれば通りました。
ENV BUNDLER_VERSION 2.1.4
RUN gem install bundler
RUN bundle install

ADD . /workdir
