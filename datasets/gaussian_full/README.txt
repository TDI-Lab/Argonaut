## INTRODUCTION

The dataset is synthetic, i.e. the values in this dataset are drawn from a Normal distribution. The dataset includes 1000 users, each with exactly 16 plans, and length of each plan is 100.

## AGENT INFO

There are 1000 files, each corresponding to one agent. The naming scheme is as follows:

	agent_XXXX.plans

where XXXX stands for the agent identification which belongs to the range [0, 999].

## PLANS INFO

Each agent file consist of 16 possible plans. Each line represents one possible plan. The format of the line is as follows:

(score):(value1,value2,value3, .... ,value100)

where (score) indicates the index of the plan. There are 100 comma-separated values after the colon sign (':'), each sampled from Normal distribution (Gaussian distribution with mean 0 and variance 1).

All possible plans have integer scores that belong to the range [0, 15], one for each plan. Plans are sorted within each file based on this score, i.e. the first row in each of the files is guaranteed to have score 0, and the last line in each file is guaranteed to have score 15.

## CONTACT

For inquiries, please contact Evangelos Pournaras (mail@epos-net.org)
