## INTRODUCTION

This dataset is generated using data sharing choices of 72 participants in a realistic living-lab experiment conducted at the Decision Science Lab (DeSciL) of ETH Zurich. These choices concern 64 data sharing scenarios: combinations of sensor data (accelerometer, light, noise, GPS), data collectors (corporation, government, NGO, educational institute), and context (social networking, transport, health, environment). The dataset consists of 3 plans for each individual containing the data sharing level under intrinsic and two rewarded data sharing requests. The cost of each plan represents the privacy loss measured with a privacy valuation scheme. The plans of this dataset are used to assess coordinated data sharing. 

The data consists of the following directories: 

- absolute-shared-data-coordinated
- absolute-sacrificed-rewards-coordinated
- relative-shared-data-coordinated
- relative-sacrificed-rewards-coordinated

These correspond to the four privacy valuation schemes. More information about the valuation schemes can be found in the related arxiv publication:

E. Pournaras, M.C. Ballandies, S. Bennati, C. Chen, Collective Privacy Recovery: Data-sharing Coordination via Decentralized Artificial Intelligence. 2023

The plans in each directory are the same, what changes is the cost values of each plan. For the ease of comparison to the coordinated data sharing, the plans to optimize for rewarded data sharing (non-coordinated) are included, that simply inverse the original cost values. These correspond to the following directories:

- absolute-shared-data-rewarded
- absolute-sacrificed-rewards-rewarded
- relative-shared-data-rewarded
- relative-sacrificed-rewards-rewarded

The dataset also contains the following directory:

- privacy-goal-signals

which encompasses 5 target signals to use for the matching optimization with EPOS. Each privacy goal signal is also a sequence of 64 values corresponding to the data sharing scenarios. For each data sharing option out of the five possible ones (very high, high, medium, low, very low), a goal signal is calculated with the 64 values representing the probability of participants choosing this data sharing option without rewards, i.e. derived realistically from the intrinsic data sharing choices of participants.

## AGENT INFO

Each dataset has 72 files, each corresponding to one agent. The naming scheme is as follows:

	agent_XXXX.plans

where XXXX stands for the agent identification which belongs to the range [0,N-1].

## PLANS INFO

Each agent file contains 3 possible plans. Each line represents one possible plan. The format of the line is as follows:

(score):(value1,value2,value3, ....,value64)

where (score) indicates the normalized privacy cost calculated with one of the four valuation schemes. There are 64 comma-separated values after the colon sign (':'), each associated with the probability of the agent to choose the given data sharing level, i.e. very high, high, medium. etc. The sequence of values correspond to the following data sharing scenarios:

acc cor soc
acc cor env
acc cor tra
acc cor hea
acc ngo soc
acc ngo env
acc ngo tra
acc ngo hea
acc gov soc
acc gov env
acc gov tra
acc gov hea
acc edu soc
acc edu env
acc edu tra
acc edu hea
lig cor soc
lig cor env
lig cor tra
lig cor hea
lig ngo soc
lig ngo env
lig ngo tra
lig ngo hea
lig gov soc
lig gov env
lig gov tra
lig gov hea
lig edu soc
lig edu env
lig edu tra
lig edu hea
noi cor soc
noi cor env
noi cor tra
noi cor hea
noi ngo soc
noi ngo env
noi ngo tra
noi ngo hea
noi gov soc
noi gov env
noi gov tra
noi gov hea
noi edu soc
noi edu env
noi edu tra
noi edu hea
gps cor soc
gps cor env
gps cor tra
gps cor hea
gps ngo soc
gps ngo env
gps ngo tra
gps ngo hea
gps gov soc
gps gov env
gps gov tra
gps gov hea
gps edu soc
gps edu env
gps edu tra
gps edu hea


## CONTACT

For inquiries, please contact Evangelos Pournaras (mail@epos-net.org)
