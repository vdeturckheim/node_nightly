FROM ubuntu

ARG DL_LINK

RUN apt-get update
RUN apt-get install -y wget

RUN wget ${DL_LINK} -O node.tar.gz
RUN mkdir node
RUN tar xvf node.tar.gz -C node --strip-components 1

RUN ln -sn /node/bin/node /usr/bin/node
RUN ln -sn /node/bin/npm /usr/bin/npm
